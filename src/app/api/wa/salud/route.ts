import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esFalloDelContacto } from '@/lib/fallosCampana'

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
    //
    // PERO SOLO CUENTAN LOS FALLOS NUESTROS. Antes se sumaban todos y eso
    // dejó las campañas trancadas sin motivo: 4 números sin WhatsApp y 1
    // excluido por un experimento de Meta dieron 25% sobre 20 envíos, el
    // freno corta en 20%, y el botón pasó a "Envío bloqueado" con la
    // plantilla recién aprobada y todo en orden. Un teléfono publicado en una
    // ficha de Google no garantiza que tenga WhatsApp: eso es el costo normal
    // de una lista scrapeada, no una señal de que estemos haciendo algo mal.
    const db = createAdminClient()
    const desde = new Date(Date.now() - 7 * 864e5).toISOString()
    const [{ count: enviados }, { data: filasFallidas }] = await Promise.all([
      db.from('campaign_targets').select('*', { count: 'exact', head: true })
        .in('estado', ['enviado', 'entregado', 'leido', 'respondio'])
        .gte('enviado_at', desde),
      db.from('campaign_targets').select('error')
        .eq('estado', 'fallido')
        .gte('creado_at', desde),
    ])

    const fallidos = filasFallidas?.length ?? 0
    const fallosContacto = (filasFallidas ?? []).filter((f) => esFalloDelContacto(f.error)).length
    const fallosSistema = fallidos - fallosContacto

    const total = (enviados ?? 0) + fallosSistema
    const tasaFallo = total > 0 ? Math.round((fallosSistema / total) * 100) : 0

    const calidad: string = d.quality_rating ?? 'UNKNOWN'
    const seguroEnviar = calidad !== 'RED' && tasaFallo < 20

    return NextResponse.json({
      numero: d.display_phone_number,
      nombre: d.verified_name,
      calidad,
      limite: d.messaging_limit_tier,
      enviados7d: enviados ?? 0,
      fallidos7d: fallidos,
      /** De esos fallidos, cuántos son números que simplemente no tienen WhatsApp. */
      fallosContacto,
      fallosSistema,
      tasaFallo,
      seguroEnviar,
      aviso:
        calidad === 'RED'
          ? 'Meta bajó la calidad del número a ROJO. Detén las campañas ya: si sigue así el número queda restringido.'
          : calidad === 'YELLOW'
            ? 'La calidad bajó a AMARILLO — hay bloqueos o reportes. Detente, revisa el mensaje y espera a que vuelva a verde.'
            : tasaFallo >= 20
              ? `${tasaFallo}% de los envíos falla por algo nuestro. Revisa que la plantilla esté aprobada antes de seguir.`
              : fallosContacto > 0
                // No es una alarma, es información sobre la lista. Por eso se
                // dice aparte y no bloquea nada.
                ? `${fallosContacto} de ${(enviados ?? 0) + fallidos} números no tienen WhatsApp o Meta no los deja recibir. Normal en una lista scrapeada; no frena la campaña.`
                : null,
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar el estado del número.' }, { status: 502 })
  }
}
