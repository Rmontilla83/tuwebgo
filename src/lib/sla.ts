import { createAdminClient } from '@/lib/supabase/admin'
import { avisarSlaVencido, type ConvEnEspera } from '@/lib/email/correos'

/**
 * El acuerdo de atención: nadie espera más de esto por una persona.
 *
 * Sofía atiende sola, pero hay cosas que no puede hacer —confirmar que entró
 * un pago, resolver una queja, salirse del catálogo— y ahí se aparta y deja
 * la conversación esperando. Ese es justo el momento en que el cliente está
 * más caliente y más cerca de comprar, y también el momento en que nadie se
 * entera si el portal está cerrado.
 */
export const LIMITE_MINUTOS = 10

/**
 * Dónde se recuerda a quién ya se le avisó.
 *
 * Va en `app_settings` (clave TEXT, valor JSONB) y no en una columna nueva
 * porque una columna pide una migración, y las migraciones de este proyecto
 * necesitan la clave de Postgres que no está a mano. La tabla ya existe y
 * hace exactamente esto.
 *
 * Sin esta memoria el aviso se repetiría cada vez que corre el chequeo —cada
 * cinco minutos, para siempre— y un aviso que llega doce veces deja de
 * leerse, que es la única forma de que un SLA falle de verdad.
 */
const CLAVE = 'sla_avisados'

type Registro = Record<string, string> // id de conversación → cuándo se avisó

async function leerAvisados(db: Db): Promise<Registro> {
  const { data } = await db.from('app_settings').select('valor').eq('clave', CLAVE).maybeSingle()
  const v = data?.valor
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Registro) : {}
}

async function guardarAvisados(db: Db, reg: Registro) {
  await db.from('app_settings').upsert(
    { clave: CLAVE, valor: reg, actualizado: new Date().toISOString() },
    { onConflict: 'clave' }
  )
}

type Db = ReturnType<typeof createAdminClient>

type FilaConv = {
  id: string
  phone_e164: string | null
  display_name: string | null
  handoff_motivo: string | null
  bot_pausado_at: string | null
  last_message_preview: string | null
  leads: { name: string | null; business_name: string | null } | null
}

/** Persona antes que negocio antes que teléfono: es como se llama a alguien. */
function nombrar(c: FilaConv): string {
  const lead = Array.isArray(c.leads) ? c.leads[0] : c.leads
  return (
    lead?.name?.trim() ||
    c.display_name?.trim() ||
    lead?.business_name?.trim() ||
    (c.phone_e164 ? `+${c.phone_e164}` : 'Sin nombre')
  )
}

export type ResultadoSla = {
  pendientes: number
  avisadas: number
  enviado: boolean
  motivo?: string
}

/**
 * Busca conversaciones vencidas y avisa por las que no se avisó todavía.
 *
 * Es idempotente: llamarla mil veces seguidas manda como mucho un correo.
 * Por eso puede colgarse tanto del cron como del webhook sin coordinar nada.
 */
export async function revisarSla(db: Db = createAdminClient()): Promise<ResultadoSla> {
  const corte = new Date(Date.now() - LIMITE_MINUTOS * 60_000).toISOString()

  const { data, error } = await db
    .from('wa_conversations')
    .select('id, phone_e164, display_name, handoff_motivo, bot_pausado_at, last_message_preview, leads(name, business_name)')
    .eq('bot_activo', false)
    .not('handoff_motivo', 'is', null)
    // Sin mensajes sin leer no hay nadie esperando: el traspaso ya se atendió.
    // Es el mismo criterio del globo ámbar del portal, a propósito — que el
    // correo y la pantalla digan lo mismo.
    .gt('unread_count', 0)
    .not('bot_pausado_at', 'is', null)
    .lt('bot_pausado_at', corte)
    .order('bot_pausado_at', { ascending: true })
    .limit(50)

  if (error) return { pendientes: 0, avisadas: 0, enviado: false, motivo: error.message }

  const filas = (data ?? []) as unknown as FilaConv[]
  const avisados = await leerAvisados(db)

  // Se limpia lo que ya no está pendiente: si esa conversación se atiende y
  // más adelante vuelve a necesitar a una persona, tiene que volver a avisar.
  const vigentes = new Set(filas.map((f) => f.id))
  const limpio: Registro = {}
  for (const [id, cuando] of Object.entries(avisados)) if (vigentes.has(id)) limpio[id] = cuando

  const nuevas = filas.filter((f) => !limpio[f.id])
  if (!nuevas.length) {
    if (Object.keys(limpio).length !== Object.keys(avisados).length) await guardarAvisados(db, limpio)
    return { pendientes: filas.length, avisadas: 0, enviado: false }
  }

  const ahora = Date.now()
  const pendientes: ConvEnEspera[] = nuevas.map((f) => ({
    id: f.id,
    quien: nombrar(f),
    telefono: f.phone_e164,
    motivo: f.handoff_motivo,
    minutos: Math.floor((ahora - new Date(f.bot_pausado_at!).getTime()) / 60_000),
    ultimo: f.last_message_preview,
  }))

  const res = await avisarSlaVencido(pendientes, LIMITE_MINUTOS)

  // Solo se marcan como avisadas si el correo SALIÓ. Si Resend falló, en la
  // próxima pasada se reintenta — al revés, un fallo silencioso dejaría al
  // cliente esperando y a nosotros creyendo que avisamos.
  if (res.ok) {
    for (const p of nuevas) limpio[p.id] = new Date().toISOString()
    await guardarAvisados(db, limpio)
  }

  return {
    pendientes: filas.length,
    avisadas: res.ok ? nuevas.length : 0,
    enviado: res.ok,
    motivo: res.ok ? undefined : res.motivo,
  }
}
