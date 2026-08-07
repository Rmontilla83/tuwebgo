import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Alineado con la versión que Meta usa para los webhooks de esta app (v26.0).
// Conviene mantener envío y recepción en la misma versión: los formatos de
// payload y los códigos de error cambian entre versiones.
// Se puede sobreescribir con GRAPH_API_VERSION sin tocar código.
const GRAPH = process.env.GRAPH_API_VERSION || 'v26.0'

/**
 * POST /api/wa/send — envía por la Cloud API y registra el mensaje.
 *
 * La ventana de servicio se valida ACÁ y no en el cliente: fuera de las 24h
 * Meta rechaza el texto libre, y si confiáramos en la UI el error aparecería
 * como un fallo genérico de la API en vez de un aviso claro.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    return NextResponse.json(
      { error: 'Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en el entorno.' },
      { status: 503 }
    )
  }

  let body: { conversationId?: string; texto?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const texto = (body.texto ?? '').trim()
  if (!body.conversationId || !texto) {
    return NextResponse.json({ error: 'Falta conversationId o texto' }, { status: 400 })
  }
  if (texto.length > 4096) {
    return NextResponse.json({ error: 'El mensaje supera los 4096 caracteres que acepta WhatsApp.' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: conv, error: convErr } = await db
    .from('wa_conversations')
    .select('id, phone_e164, window_expires_at, fep_expires_at')
    .eq('id', body.conversationId)
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  const ahora = Date.now()
  const ventanaAbierta =
    (conv.window_expires_at && new Date(conv.window_expires_at).getTime() > ahora) ||
    (conv.fep_expires_at && new Date(conv.fep_expires_at).getTime() > ahora)

  if (!ventanaAbierta) {
    return NextResponse.json(
      {
        error: 'La ventana de 24 horas está cerrada. Fuera de ella Meta solo permite plantillas aprobadas.',
        codigo: 'VENTANA_CERRADA',
      },
      { status: 409 }
    )
  }

  // ── Envío a Meta ──
  let respuesta: Response
  try {
    respuesta = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: conv.phone_e164,
        type: 'text',
        text: { preview_url: true, body: texto },
      }),
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo contactar la API de WhatsApp.' }, { status: 502 })
  }

  const datos = await respuesta.json().catch(() => ({}))

  if (!respuesta.ok) {
    const detalle = datos?.error?.message ?? `HTTP ${respuesta.status}`
    // Se registra el fallo para que quede en el hilo y no se pierda el intento.
    await db.from('wa_messages').insert({
      conversation_id: conv.id,
      direction: 'out',
      channel: 'cloud_api',
      msg_type: 'text',
      body: texto,
      status: 'failed',
      error_detail: detalle,
      sent_by: user.id,
    })
    console.error('[wa-send]', detalle)
    return NextResponse.json({ error: `WhatsApp rechazó el envío: ${detalle}` }, { status: 502 })
  }

  const wamid: string | undefined = datos?.messages?.[0]?.id

  const { error: insErr } = await db.from('wa_messages').insert({
    conversation_id: conv.id,
    wamid: wamid ?? null,
    direction: 'out',
    channel: 'cloud_api',
    msg_type: 'text',
    body: texto,
    status: 'sent',
    sent_by: user.id,
  })

  if (insErr) {
    // El mensaje SÍ salió; solo falló el registro. Hay que decirlo distinto:
    // reintentar el envío duplicaría el mensaje del cliente.
    console.error('[wa-send] enviado pero no registrado:', insErr.message)
    return NextResponse.json(
      { ok: true, wamid, aviso: 'El mensaje se envió pero no se pudo registrar en el historial.' },
      { status: 200 }
    )
  }

  return NextResponse.json({ ok: true, wamid })
}
