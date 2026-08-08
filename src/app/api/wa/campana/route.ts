import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANTILLAS } from '@/lib/waTemplates'

export const runtime = 'nodejs'
export const maxDuration = 60

const GRAPH = process.env.GRAPH_API_VERSION || 'v26.0'

/**
 * Despacha una tanda de una campaña de WhatsApp.
 *
 * NO envía la campaña entera de un saque, y eso es a propósito:
 *
 *  · Meta permite iniciar conversación con 250 clientes ÚNICOS cada 24h sin
 *    verificación de negocio. Con 613 contactos, mandarlos todos juntos hace
 *    que a partir del 251 fallen — y esos fallos cuentan como intentos.
 *  · Un pico de cientos de envíos seguidos es la clase de patrón que dispara
 *    revisiones de calidad en Meta. El número de teléfono es el activo más
 *    difícil de reemplazar del negocio.
 *  · Un serverless de Vercel tiene tope de duración. Mandar 613 mensajes
 *    secuenciales no entra en una request.
 *
 * Cada llamada manda hasta `tanda` mensajes y devuelve cuánto queda. La UI
 * llama de nuevo hasta terminar, mostrando el avance.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    return NextResponse.json({ error: 'Faltan credenciales de WhatsApp.' }, { status: 503 })
  }

  let body: { campaignId?: string; tanda?: number }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  if (!body.campaignId) return NextResponse.json({ error: 'Falta campaignId' }, { status: 400 })

  const tanda = Math.min(Math.max(body.tanda ?? 20, 1), 40)
  const db = createAdminClient()

  const { data: camp, error: campErr } = await db
    .from('campaigns').select('id, name, plantilla, status, enviados_por_dia')
    .eq('id', body.campaignId).single()

  if (campErr || !camp) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  if (camp.status !== 'active') {
    return NextResponse.json({ error: 'La campaña está pausada. Actívala para enviar.' }, { status: 409 })
  }
  if (!camp.plantilla) {
    return NextResponse.json({ error: 'La campaña no tiene plantilla asignada.' }, { status: 409 })
  }

  const plantilla = PLANTILLAS.find((p) => p.name === camp.plantilla)
  if (!plantilla) {
    return NextResponse.json({ error: `La plantilla "${camp.plantilla}" ya no existe.` }, { status: 409 })
  }

  // ── Cupo de Meta ──
  const { data: iniciadas } = await db.rpc('wa_iniciadas_hoy')
  const usadas = Number(iniciadas ?? 0)
  const tope = Math.min(camp.enviados_por_dia ?? 200, 250)
  const cupo = Math.max(0, tope - usadas)

  if (cupo === 0) {
    return NextResponse.json({
      ok: true, enviados: 0, fallidos: 0, restantes: null, cupoAgotado: true,
      mensaje: `Ya se iniciaron ${usadas} conversaciones en las últimas 24 horas. Meta no permite más hasta que se libere la ventana.`,
    })
  }

  const { data: targets, error: tErr } = await db
    .from('campaign_targets')
    .select('id, lead_id, leads(name, business_name, phone_e164)')
    .eq('campaign_id', camp.id).eq('estado', 'pendiente')
    .limit(Math.min(tanda, cupo))

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 502 })
  if (!targets?.length) {
    return NextResponse.json({ ok: true, enviados: 0, fallidos: 0, restantes: 0, terminada: true })
  }

  let enviados = 0, fallidos = 0

  // Secuencial y no en paralelo: Meta limita por segundo y en paralelo devuelve
  // errores de rate limit que parecen rechazos de contenido.
  for (const t of targets) {
    const lead = t.leads as { name?: string | null; business_name?: string | null; phone_e164?: string | null } | null
    const tel = lead?.phone_e164
    if (!tel) {
      await db.from('campaign_targets').update({ estado: 'omitido', error: 'Sin teléfono válido' }).eq('id', t.id)
      continue
    }

    const params = plantilla.ejemplos.map((_, i) =>
      i === 0
        ? (lead?.name?.trim().split(/\s+/)[0] || 'Hola')
        : (lead?.business_name?.trim() || 'tu negocio')
    )

    try {
      const { data: convId } = await db.rpc('wa_get_or_create_conversation', {
        p_phone: tel, p_lead_id: t.lead_id,
      })

      const res = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: tel,
          type: 'template',
          template: {
            name: plantilla.name, language: { code: 'es' },
            components: [{ type: 'body', parameters: params.map((x) => ({ type: 'text', text: x })) }],
          },
        }),
      })
      const datos = await res.json().catch(() => ({}))

      if (!res.ok) {
        const detalle = datos?.error?.error_user_msg ?? datos?.error?.message ?? `HTTP ${res.status}`
        await db.from('campaign_targets').update({ estado: 'fallido', error: detalle.slice(0, 300) }).eq('id', t.id)
        fallidos++
        // Si Meta corta por límite, no seguimos golpeando: el resto queda
        // pendiente para la próxima tanda.
        if (/rate|limit|too many/i.test(detalle)) break
        continue
      }

      const wamid: string | undefined = datos?.messages?.[0]?.id

      if (convId) {
        await db.from('wa_messages').insert({
          conversation_id: convId, wamid: wamid ?? null,
          direction: 'out', channel: 'cloud_api', msg_type: 'template',
          body: `[${plantilla.name}] ${params.join(' · ')}`,
          template_name: plantilla.name, status: 'sent', sent_by: user.id,
        })
      }

      await db.from('campaign_targets')
        .update({ estado: 'enviado', wamid: wamid ?? null, enviado_at: new Date().toISOString(), error: null })
        .eq('id', t.id)

      // El contacto deja de estar "sin contactar" en el momento en que se le
      // escribe: si no, el pipeline sigue diciendo que nadie lo tocó.
      await db.from('leads').update({ current_stage: 'conversando' })
        .eq('id', t.lead_id).eq('current_stage', 'sin_contactar')

      enviados++
    } catch (e) {
      await db.from('campaign_targets')
        .update({ estado: 'fallido', error: (e instanceof Error ? e.message : 'Error de red').slice(0, 300) })
        .eq('id', t.id)
      fallidos++
    }
  }

  const { count: restantes } = await db
    .from('campaign_targets').select('*', { count: 'exact', head: true })
    .eq('campaign_id', camp.id).eq('estado', 'pendiente')

  return NextResponse.json({
    ok: true, enviados, fallidos,
    restantes: restantes ?? 0,
    terminada: (restantes ?? 0) === 0,
    cupoRestante: Math.max(0, cupo - enviados),
  })
}
