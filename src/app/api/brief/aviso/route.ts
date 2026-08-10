import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { avisarPredisenoListo } from '@/lib/email/correos'

export const runtime = 'nodejs'

/**
 * POST /api/brief/aviso — avisarle al cliente que su pre-diseño está listo.
 *
 * Lo dispara Rafael desde la sección Briefs cuando terminó la página. Va con
 * sesión: manda un correo a un cliente en nombre de TuWebGo, y eso no puede
 * quedar abierto.
 */

/**
 * Dónde se recuerda a quién ya se le avisó.
 *
 * En `app_settings` y no en una columna de `briefs` porque una columna pide
 * migración, y las de este proyecto necesitan la clave de Postgres que no
 * está a mano. Tampoco va dentro de `briefs.datos`: ese JSONB son las
 * respuestas del cliente tal como las mandó, y meterle metadatos nuestros
 * ensuciaría el .md y el export al constructor, que salen de ahí.
 */
const CLAVE = 'prediseno_avisado'
type Registro = Record<string, { fecha: string; url: string }>

/** Solo http(s). Sin esto un `javascript:` acabaría dentro de un correo nuestro. */
function urlValida(v: string): string | null {
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { briefId?: number; url?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  if (!body.briefId) return NextResponse.json({ error: 'Falta el brief' }, { status: 400 })

  const url = urlValida(body.url ?? '')
  if (!url) {
    return NextResponse.json(
      { error: 'El enlace no es válido. Debe empezar con https://' },
      { status: 400 }
    )
  }

  const db = createAdminClient()

  const { data: brief, error: bErr } = await db
    .from('briefs')
    .select('id, negocio, datos, conversation_id')
    .eq('id', body.briefId)
    .maybeSingle()

  if (bErr || !brief) return NextResponse.json({ error: 'No se encontró el brief' }, { status: 404 })

  const datos = (brief.datos ?? {}) as Record<string, unknown>
  const correo = typeof datos.email === 'string' ? datos.email.trim() : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    // No es un error del sistema: ese cliente simplemente no dejó correo.
    // Se dice claro para que Rafael lo mande por WhatsApp y no se quede
    // esperando un correo que nunca iba a salir.
    return NextResponse.json(
      { error: 'Este cliente no dejó correo en el formulario. Mándale el enlace por WhatsApp.' },
      { status: 409 }
    )
  }

  const negocio = brief.negocio || (typeof datos.nombre === 'string' ? datos.nombre : 'tu negocio')
  const res = await avisarPredisenoListo({ correo, negocio, url })
  if (!res.ok) {
    return NextResponse.json({ error: `No se pudo enviar: ${res.motivo}` }, { status: 502 })
  }

  // Queda registrado en la conversación. Sin esto, dentro de dos semanas no
  // hay forma de saber si a este cliente ya se le mandó su página o no.
  if (brief.conversation_id) {
    await db.from('wa_messages').insert({
      conversation_id: brief.conversation_id,
      direction: 'out',
      channel: 'cloud_api',
      msg_type: 'system',
      body: `Se le avisó por correo que el pre-diseño está listo: ${url}`,
      status: 'sent',
      sent_by: user.id,
    })
  }

  const { data: previo } = await db
    .from('app_settings').select('valor').eq('clave', CLAVE).maybeSingle()
  const reg: Registro =
    previo?.valor && typeof previo.valor === 'object' && !Array.isArray(previo.valor)
      ? (previo.valor as Registro)
      : {}
  reg[String(brief.id)] = { fecha: new Date().toISOString(), url }
  await db.from('app_settings').upsert(
    { clave: CLAVE, valor: reg, actualizado: new Date().toISOString() },
    { onConflict: 'clave' }
  )

  return NextResponse.json({ ok: true, correo })
}

/** GET — a qué briefs ya se les avisó, para pintarlo en la lista. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data } = await createAdminClient()
    .from('app_settings').select('valor').eq('clave', CLAVE).maybeSingle()

  const reg =
    data?.valor && typeof data.valor === 'object' && !Array.isArray(data.valor) ? data.valor : {}
  return NextResponse.json({ avisados: reg })
}
