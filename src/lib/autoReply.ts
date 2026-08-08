import { createAdminClient } from '@/lib/supabase/admin'
import { redactarBorrador, type TurnoConversacion } from '@/lib/gemini'
import { ETAPA_POR_HANDOFF, ETAPA_CONVERSANDO } from '@/lib/config'

const GRAPH = process.env.GRAPH_API_VERSION || 'v26.0'

type Db = ReturnType<typeof createAdminClient>

/**
 * Responde sola una conversación entrante.
 *
 * Se llama desde el webhook tras guardar cada mensaje del cliente. Todo lo que
 * puede salir mal está contemplado, porque acá el modelo le habla a un cliente
 * real sin que nadie mire:
 *
 *   1. Interruptor global apagado           → no responde
 *   2. Bot pausado en esa conversación      → no responde
 *   3. Tope de respuestas seguidas          → se aparta (protege de bucles)
 *   4. Ventana de 24h cerrada               → no responde (Meta lo rechazaría)
 *   5. El modelo detecta cierre/queja       → responde y se aparta
 *   6. Cualquier error                      → se aparta, nunca rompe el webhook
 *
 * Apartarse = bot_activo en false + handoff_motivo. Rafael lo ve en el inbox.
 */
export async function responderAutomatico(db: Db, convId: string): Promise<void> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    const token = process.env.WHATSAPP_TOKEN
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (!apiKey || !token || !phoneId) return

    // ── Ajustes globales ──
    const { data: ajustes } = await db
      .from('app_settings').select('clave, valor').in('clave', ['bot_habilitado', 'bot_max_seguidas'])

    const mapa = Object.fromEntries((ajustes ?? []).map((a) => [a.clave, a.valor]))
    if (mapa.bot_habilitado === false) return
    const maxSeguidas = Number(mapa.bot_max_seguidas ?? 6)

    // ── Estado de la conversación ──
    const { data: conv } = await db
      .from('wa_conversations')
      .select('id, phone_e164, bot_activo, bot_seguidas, window_expires_at, fep_expires_at, lead_id, leads(name, business_name, current_stage, plan_interested, amount_quoted, ref_code)')
      .eq('id', convId)
      .single()

    if (!conv || !conv.bot_activo) return

    // Bucle: el cliente no avanza y el bot sigue hablando solo.
    if ((conv.bot_seguidas ?? 0) >= maxSeguidas) {
      await apartarse(db, convId, 'La conversación se alargó sin avanzar')
      return
    }

    const ahora = Date.now()
    const ventanaAbierta =
      (conv.window_expires_at && new Date(conv.window_expires_at).getTime() > ahora) ||
      (conv.fep_expires_at && new Date(conv.fep_expires_at).getTime() > ahora)
    if (!ventanaAbierta) return

    // ── Historial ──
    const { data: msgs } = await db
      .from('wa_messages')
      .select('direction, body, msg_type, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(20)

    const historial: TurnoConversacion[] = (msgs ?? [])
      .reverse()
      .map((m) => ({
        autor: m.direction === 'out' ? ('rafael' as const) : ('cliente' as const),
        texto: m.body ?? `[${m.msg_type}]`,
      }))

    // Nada que responder si el último mensaje no es del cliente.
    if (historial.at(-1)?.autor !== 'cliente') return

    const lead = (conv.leads ?? {}) as {
      name?: string | null; business_name?: string | null; current_stage?: string | null
      plan_interested?: string | null; amount_quoted?: number | null; ref_code?: string | null
    }

    // ── Redacción ──
    const { texto, handoff } = await redactarBorrador({
      apiKey,
      modelo: process.env.GEMINI_MODEL,
      lead: {
        nombre: lead.name, negocio: lead.business_name, etapa: lead.current_stage,
        plan: lead.plan_interested, montoCotizado: lead.amount_quoted, refCode: lead.ref_code,
      },
      conversacion: historial,
    })

    if (!texto.trim()) { await apartarse(db, convId, 'El asistente no pudo redactar'); return }

    // ── Envío ──
    const res = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
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
    const datos = await res.json().catch(() => ({}))

    if (!res.ok) {
      const detalle = datos?.error?.message ?? `HTTP ${res.status}`
      await db.from('wa_messages').insert({
        conversation_id: convId, direction: 'out', channel: 'cloud_api', msg_type: 'text',
        body: texto, status: 'failed', error_detail: detalle, por_bot: true,
      })
      await apartarse(db, convId, `Falló el envío automático: ${detalle}`)
      return
    }

    // sent_by queda nulo a propósito: no lo mandó ningún humano, y así el
    // trigger que pausa el bot cuando escribe Rafael no se dispara.
    await db.from('wa_messages').insert({
      conversation_id: convId,
      wamid: datos?.messages?.[0]?.id ?? null,
      direction: 'out', channel: 'cloud_api', msg_type: 'text',
      body: texto, status: 'sent', por_bot: true,
    })

    // Sofía mueve el lead solo en el tramo que ella controla. Lo que viene
    // después de que entra dinero depende de hechos que no puede verificar.
    if (conv.lead_id) {
      const destino = handoff ? ETAPA_POR_HANDOFF[handoff] : ETAPA_CONVERSANDO
      const actual = (conv.leads as { current_stage?: string } | null)?.current_stage

      // Solo avanza, nunca retrocede. Se compara por sort_order y no por una
      // lista de slugs: la migración 008 renombró las etapas y una lista quemada
      // dejó esto muerto sin que nadie lo notara.
      const { data: ord } = await db.from('pipeline_stages').select('slug, sort_order')
      const orden = new Map((ord ?? []).map((e) => [e.slug, e.sort_order]))
      const puedeMover =
        !!destino && destino !== actual &&
        (orden.get(destino) ?? 0) > (orden.get(actual ?? '') ?? 99)

      if (puedeMover) {
        const { error: etErr } = await db.from('leads')
          .update({ current_stage: destino }).eq('id', conv.lead_id)
        if (etErr) console.error('[autoReply] etapa:', etErr.message)
      }
    }

    if (handoff) {
      await apartarse(db, convId, handoff)
    }
  } catch (e) {
    // Un fallo del bot no puede tumbar el webhook: el mensaje del cliente ya
    // está guardado y debe aparecer en el inbox igual.
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[autoReply]', msg)
    try { await apartarse(db, convId, `Error del asistente: ${msg.slice(0, 120)}`) } catch { /* nada */ }
  }
}

async function apartarse(db: Db, convId: string, motivo: string) {
  await db.rpc('wa_handoff', { p_conv_id: convId, p_motivo: motivo })
}
