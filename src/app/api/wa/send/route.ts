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

  let body: {
    conversationId?: string; phone?: string; leadId?: string; texto?: string
    plantilla?: { name: string; params: string[] }
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const texto = (body.texto ?? '').trim()
  const plantilla = body.plantilla

  if (!texto && !plantilla) return NextResponse.json({ error: 'Falta el texto o la plantilla' }, { status: 400 })
  if (!body.conversationId && !body.phone) {
    return NextResponse.json({ error: 'Falta conversationId o phone' }, { status: 400 })
  }
  if (texto.length > 4096) {
    return NextResponse.json({ error: 'El mensaje supera los 4096 caracteres que acepta WhatsApp.' }, { status: 400 })
  }

  const db = createAdminClient()

  // Se puede llamar con la conversación (desde el Inbox) o con un teléfono
  // suelto (desde la ficha del lead, donde puede que aún no exista el hilo).
  let convId = body.conversationId
  if (!convId) {
    const { data, error: rpcErr } = await db.rpc('wa_get_or_create_conversation', {
      p_phone: body.phone,
      p_lead_id: body.leadId ?? null,
    })
    if (rpcErr || !data) {
      return NextResponse.json({ error: rpcErr?.message ?? 'Teléfono inválido' }, { status: 400 })
    }
    convId = data as string
  }

  const { data: conv, error: convErr } = await db
    .from('wa_conversations')
    .select('id, phone_e164, window_expires_at, fep_expires_at')
    .eq('id', convId)
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  const ahora = Date.now()
  const ventanaAbierta =
    (conv.window_expires_at && new Date(conv.window_expires_at).getTime() > ahora) ||
    (conv.fep_expires_at && new Date(conv.fep_expires_at).getTime() > ahora)

  // Las plantillas son justamente el permiso para escribir fuera de la ventana,
  // así que solo el texto libre queda bloqueado.
  if (!ventanaAbierta && !plantilla) {
    return NextResponse.json(
      {
        error: 'La ventana de 24 horas está cerrada. Fuera de ella Meta solo permite plantillas aprobadas.',
        codigo: 'VENTANA_CERRADA',
      },
      { status: 409 }
    )
  }

  const payload = plantilla
    ? {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: conv.phone_e164,
        type: 'template',
        template: {
          name: plantilla.name,
          language: { code: 'es' },
          ...(plantilla.params?.length
            ? { components: [{ type: 'body', parameters: plantilla.params.map((t) => ({ type: 'text', text: t })) }] }
            : {}),
        },
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: conv.phone_e164,
        type: 'text',
        text: { preview_url: true, body: texto },
      }

  // Lo que se guarda en el hilo: la plantilla con las variables ya sustituidas,
  // para que el historial muestre lo que el cliente realmente leyó.
  const cuerpoRegistrado = texto || `[plantilla ${plantilla!.name}] ${(plantilla!.params ?? []).join(' · ')}`

  // ── Envío a Meta ──
  let respuesta: Response
  try {
    respuesta = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      body: cuerpoRegistrado,
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
    msg_type: plantilla ? 'template' : 'text',
    body: cuerpoRegistrado,
    template_name: plantilla?.name ?? null,
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
