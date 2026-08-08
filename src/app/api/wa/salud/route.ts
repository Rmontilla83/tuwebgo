import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const GRAPH = process.env.GRAPH_API_VERSION || 'v26.0'

/**
 * Salud del número de WhatsApp.
 *
 * Es el sistema de alerta temprana de las campañas en frío. Meta califica cada
 * número con un quality_rating a partir de bloqueos y reportes de los últimos
 * 7 días:
 *
 *   GREEN  → todo bien
 *   YELLOW → ya hay bloqueos. Parar y revisar el mensaje.
 *   RED    → Meta va a bajar el límite de mensajería. Parar TODO.
 *
 * Cuando cae a RED, el límite baja y si sigue así el número queda restringido.
 * Recuperarlo lleva semanas si se recupera. Por eso esto se consulta antes de
 * cada tanda y no una vez al mes.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    return NextResponse.json({ error: 'Faltan credenciales de WhatsApp.' }, { status: 503 })
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH}/${phoneId}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier,code_verification_status`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    )
    const d = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: d?.error?.message ?? `HTTP ${res.status}` }, { status: 502 })
    }

    // Señal propia: qué proporción de los envíos de campaña está fallando.
    // Un salto acá suele adelantarse a que Meta mueva el quality_rating.
    const db = createAdminClient()
    const [{ count: enviados }, { count: fallidos }] = await Promise.all([
      db.from('campaign_targets').select('*', { count: 'exact', head: true })
        .in('estado', ['enviado', 'entregado', 'leido', 'respondio'])
        .gte('enviado_at', new Date(Date.now() - 7 * 864e5).toISOString()),
      db.from('campaign_targets').select('*', { count: 'exact', head: true })
        .eq('estado', 'fallido')
        .gte('creado_at', new Date(Date.now() - 7 * 864e5).toISOString()),
    ])

    const total = (enviados ?? 0) + (fallidos ?? 0)
    const tasaFallo = total > 0 ? Math.round(((fallidos ?? 0) / total) * 100) : 0

    const calidad: string = d.quality_rating ?? 'UNKNOWN'
    const seguroEnviar = calidad !== 'RED' && tasaFallo < 20

    return NextResponse.json({
      numero: d.display_phone_number,
      nombre: d.verified_name,
      calidad,
      limite: d.messaging_limit_tier,
      enviados7d: enviados ?? 0,
      fallidos7d: fallidos ?? 0,
      tasaFallo,
      seguroEnviar,
      aviso:
        calidad === 'RED'
          ? 'Meta bajó la calidad del número a ROJO. Pará las campañas ya: si sigue así el número queda restringido.'
          : calidad === 'YELLOW'
            ? 'La calidad bajó a AMARILLO — hay bloqueos o reportes. Pará, revisá el mensaje y esperá a que vuelva a verde.'
            : tasaFallo >= 20
              ? `${tasaFallo}% de los envíos está fallando. Revisá que la plantilla esté aprobada antes de seguir.`
              : null,
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar el estado del número.' }, { status: 502 })
  }
}
