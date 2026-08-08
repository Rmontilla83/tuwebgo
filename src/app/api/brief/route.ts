import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * El brief del cliente.
 *
 * Endpoint PÚBLICO — lo llama el formulario que llena el cliente, que no tiene
 * sesión ni la va a tener. Lo que lo protege es el token: 64 bits aleatorios
 * que solo viajaron en el WhatsApp que Sofía le mandó a esa persona.
 *
 * Por eso la escritura pasa por acá con service_role y no directo desde el
 * navegador con la anon key: si anon pudiera insertar en `briefs`, cualquiera
 * llenaría la tabla con un curl.
 */

/** Cuántos caracteres se aceptan por respuesta. Corta un pegado accidental de media novela. */
const MAX_CAMPO = 2000
/** Cuántas claves distintas puede traer el formulario. */
const MAX_CLAVES = 60

type Resuelto = {
  conversation_id: string
  lead_id: string | null
  nombre: string | null
  negocio: string | null
  ya_enviado: boolean
}

async function resolver(token: string) {
  const db = createAdminClient()
  const { data, error } = await db.rpc('brief_resolver', { p_token: token })
  if (error) throw new Error(error.message)
  const fila = (Array.isArray(data) ? data[0] : data) as Resuelto | undefined
  return { db, fila }
}

/**
 * GET /api/brief?t=<token>
 * El formulario pregunta "¿de quién es este enlace?" para saludar por su
 * nombre y para saber si ya lo enviaron.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')?.trim()
  if (!token) return NextResponse.json({ error: 'Falta el enlace' }, { status: 400 })

  try {
    const { fila } = await resolver(token)
    if (!fila) {
      return NextResponse.json({ error: 'Este enlace no es válido' }, { status: 404 })
    }
    return NextResponse.json({
      nombre: fila.nombre,
      negocio: fila.negocio,
      yaEnviado: fila.ya_enviado,
    })
  } catch (e) {
    console.error('[api/brief GET]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo verificar el enlace' }, { status: 500 })
  }
}

/**
 * POST /api/brief?t=<token>
 * Guarda el brief y avisa en la conversación. No manda el brief por WhatsApp:
 * ese era justamente el problema que esto viene a resolver.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('t')?.trim()
  if (!token) return NextResponse.json({ error: 'Falta el enlace' }, { status: 400 })

  let cuerpo: { datos?: Record<string, unknown> }
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const crudo = cuerpo.datos
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  // Se recorta acá y no en el navegador: el navegador es del cliente y
  // cualquiera puede saltarse el formulario y postear a mano.
  const datos: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(crudo).slice(0, MAX_CLAVES)) {
    if (typeof v === 'string') datos[k] = v.slice(0, MAX_CAMPO)
    else if (Array.isArray(v)) datos[k] = v.slice(0, 30).map((x) => String(x).slice(0, 200))
    else if (v == null || typeof v === 'number' || typeof v === 'boolean') datos[k] = v
  }
  if (!Object.keys(datos).length) {
    return NextResponse.json({ error: 'El formulario llegó vacío' }, { status: 400 })
  }

  try {
    const { db, fila } = await resolver(token)
    if (!fila) return NextResponse.json({ error: 'Este enlace no es válido' }, { status: 404 })

    const { error: insErr } = await db.from('briefs').insert({
      lead_id: fila.lead_id,
      conversation_id: fila.conversation_id,
      negocio: typeof datos.nombre === 'string' ? datos.nombre : fila.negocio,
      datos,
    })
    if (insErr) throw new Error(insErr.message)

    // Deja rastro en la conversación para que se vea en el inbox al lado de
    // los mensajes, pero como UNA línea. El contenido se lee en el portal.
    // Si esto falla el brief ya está guardado, que es lo que importa: se
    // registra y se sigue.
    const { error: msgErr } = await db.from('wa_messages').insert({
      conversation_id: fila.conversation_id,
      direction: 'in',
      channel: 'cloud_api',
      msg_type: 'system',
      body: 'El cliente completó el formulario del pre-diseño.',
      status: 'delivered',
    })
    if (msgErr) console.error('[api/brief] aviso en conversación:', msgErr.message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/brief POST]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo guardar. Intenta de nuevo.' }, { status: 500 })
  }
}
