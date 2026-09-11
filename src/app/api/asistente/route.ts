import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { responderVisitante, type PlanWeb } from '@/lib/asistenteWeb'
import { firmarConversacion, verificarConversacion, MAX_TURNOS, type TurnoWeb } from '@/lib/firmaConversacion'
import { cabecerasCors, crearLimitador, ipDe, origenPermitido } from '@/lib/corsLanding'

export const runtime = 'nodejs'

/**
 * POST /api/asistente — Sofía respondiendo en el chat de tuwebgo.net.
 *
 * Sin estado: la conversación la guarda el navegador y vuelve firmada en cada
 * mensaje (ver lib/firmaConversacion.ts). Cuando el visitante deja sus datos,
 * la landing la manda junto al formulario a /api/contacto, que crea el lead y
 * le avisa a Rafael con la conversación completa.
 *
 * Es un endpoint público que gasta Gemini en cada llamada. Lo cuidan:
 *   · límite por IP;
 *   · tope de mensajes por conversación, después solo invita a dejar datos;
 *   · tope diario de llamadas, contado en ia_uso;
 *   · y ante cualquier falla, una respuesta fija que invita a dejar los datos:
 *     el visitante nunca se queda mirando un error.
 */

const MAX_MENSAJE = 600
const MAX_CUERPO = 80_000
/** Mensajes del visitante por conversación antes de pasar a pedir los datos. */
const MAX_PREGUNTAS = 15
/** Llamadas a Gemini por día entre todas las visitas. ~$0,002 cada una. */
const TOPE_DIARIO = 600

const excedeIp = crearLimitador(30, 10 * 60_000)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FIJOS = {
  es: {
    datos: 'No pude leer tu mensaje. Recarga la página e intenta de nuevo.',
    muchos: 'Vas muy rápido. Espera un momento y vuelve a escribirme.',
    tope: 'Para seguir conversando, déjame tu nombre y tu WhatsApp o correo en la tarjeta de abajo, y Rafael, del equipo, te escribe.',
    falla: 'Se me complicó responderte ahora. Si quieres, deja tus datos abajo y el equipo te escribe.',
  },
  en: {
    datos: "I couldn't read your message. Reload the page and try again.",
    muchos: "You're going a bit fast. Wait a moment and write again.",
    tope: 'To keep talking, leave your name and WhatsApp or email in the card below, and Rafael from our team will reach out.',
    falla: "I couldn't answer right now. If you'd like, leave your details below and the team will reach out.",
  },
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cabecerasCors(request.headers.get('origin')) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = cabecerasCors(origin)
  const json = (cuerpo: object, status = 200) => NextResponse.json(cuerpo, { status, headers })

  if (!origenPermitido(origin)) return json({ ok: false, error: FIJOS.es.datos }, 403)
  if (Number(request.headers.get('content-length') ?? 0) > MAX_CUERPO) return json({ ok: false, error: FIJOS.es.datos }, 413)

  let crudo: Record<string, unknown>
  try {
    const texto = await request.text()
    if (texto.length > MAX_CUERPO) throw new Error('cuerpo demasiado grande')
    const p: unknown = JSON.parse(texto)
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('no es un objeto')
    crudo = p as Record<string, unknown>
  } catch {
    return json({ ok: false, error: FIJOS.es.datos }, 400)
  }

  const idioma: 'es' | 'en' = crudo.idioma === 'en' ? 'en' : 'es'
  const f = FIJOS[idioma]
  const sesion = typeof crudo.session_id === 'string' && UUID.test(crudo.session_id) ? crudo.session_id : null
  const mensaje = typeof crudo.mensaje === 'string' ? crudo.mensaje.trim().slice(0, MAX_MENSAJE) : ''
  if (!sesion || !mensaje) return json({ ok: false, error: f.datos }, 400)

  if (excedeIp(ipDe(request))) return json({ ok: false, error: f.muchos }, 429)

  // Un historial sin firma válida no se descarta con error: la conversación
  // simplemente arranca de cero. Al visitante honesto no le pasa nunca.
  const previos = verificarConversacion(sesion, crudo.turnos, crudo.firma) ?? []
  const conNuevo: TurnoWeb[] = [...previos, { rol: 'visitante' as const, texto: mensaje }].slice(-(MAX_TURNOS - 1))
  const datosDejados = crudo.datos_dejados === true

  const cerrar = (texto: string, extra: { enlaces?: object[]; pedirDatos?: boolean; plan?: PlanWeb | null } = {}) => {
    const turnos: TurnoWeb[] = [...conNuevo, { rol: 'sofia' as const, texto }].slice(-MAX_TURNOS)
    return json({
      ok: true,
      texto,
      enlaces: extra.enlaces ?? [],
      pedirDatos: extra.pedirDatos ?? false,
      plan: extra.plan ?? null,
      turnos,
      firma: firmarConversacion(sesion, turnos),
    })
  }

  const preguntas = conNuevo.filter((t) => t.rol === 'visitante').length
  if (preguntas > MAX_PREGUNTAS) return cerrar(f.tope, { pedirDatos: !datosDejados })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[api/asistente] falta GEMINI_API_KEY')
    return cerrar(f.falla, { pedirDatos: !datosDejados })
  }

  const db = createAdminClient()
  const { count: hoy, error: cuentaErr } = await db
    .from('ia_uso')
    .select('id', { count: 'exact', head: true })
    .eq('contexto', 'web')
    .gte('creado_at', new Date(Date.now() - 86_400_000).toISOString())
  if (cuentaErr) console.error('[api/asistente] conteo diario:', cuentaErr.message)
  if ((hoy ?? 0) >= TOPE_DIARIO) {
    console.error(`[api/asistente] tope diario de ${TOPE_DIARIO} llamadas alcanzado`)
    return cerrar(f.tope, { pedirDatos: !datosDejados })
  }

  try {
    const r = await responderVisitante({
      apiKey,
      modelo: process.env.GEMINI_MODEL,
      turnos: conNuevo,
      idioma,
      datosDejados,
    })

    after(async () => {
      const { error } = await db.from('ia_uso').insert({
        modelo: r.modelo, contexto: 'web', tokens_in: r.tokensIn, tokens_out: r.tokensOut,
      })
      if (error) console.error('[api/asistente] ia_uso:', error.message)
    })

    if (!r.texto) return cerrar(f.falla, { pedirDatos: !datosDejados })
    return cerrar(r.texto, { enlaces: r.enlaces, pedirDatos: r.pedirDatos && !datosDejados, plan: r.plan })
  } catch (e) {
    console.error('[api/asistente]', e instanceof Error ? e.message : e)
    return cerrar(f.falla, { pedirDatos: !datosDejados })
  }
}
