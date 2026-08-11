import { NextResponse, after } from 'next/server'
import { avisarCampanaTerminada, avisarCampanaDetenida } from '@/lib/email/correos'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANTILLAS } from '@/lib/waTemplates'
import { paramsDePlantilla, type LeadParaPlantilla } from '@/lib/plantillaParams'
import { ETAPA_CONTACTADO } from '@/lib/config'

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
    .select('id, lead_id, leads(name, business_name, phone_e164, ciudad, notes)')
    .eq('campaign_id', camp.id).eq('estado', 'pendiente')
    .limit(Math.min(tanda, cupo))

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 502 })
  if (!targets?.length) {
    return NextResponse.json({ ok: true, enviados: 0, fallidos: 0, restantes: 0, terminada: true })
  }

  let enviados = 0, fallidos = 0

  /**
   * Freno para cuando lo que falla es la configuración, no el contacto.
   *
   * Un error sistemático —plantilla todavía sin aprobar, idioma que no
   * coincide, token vencido, cantidad de variables equivocada— le pasa
   * idéntico a los 173. Y como el bucle solo cortaba por límite de Meta,
   * seguía de largo marcando 'fallido' uno por uno; el siguiente lote consulta
   * `estado = 'pendiente'`, así que un contacto marcado así NO se reintenta
   * nunca. Un token mal copiado quemaba la lista entera en dos tandas, y
   * desde el panel solo se veía "40 fallidos".
   *
   * Tres errores idénticos seguidos no son casualidad: es la configuración.
   * Ahí se para y esos tres vuelven a 'pendiente' — no se pierde ninguno, y
   * arreglando lo que sea el envío sigue donde quedó.
   *
   * Se comparan los textos de error: dos números inválidos distintos dan
   * mensajes distintos, una plantilla sin aprobar da siempre el mismo.
   */
  let ultimoError: string | null = null
  let seguidos = 0
  let idsSeguidos: string[] = []
  let errorSistematico: string | null = null

  // Secuencial y no en paralelo: Meta limita por segundo y en paralelo devuelve
  // errores de rate limit que parecen rechazos de contenido.
  for (const t of targets) {
    const lead = t.leads as (LeadParaPlantilla & { phone_e164?: string | null }) | null
    const tel = lead?.phone_e164
    if (!tel) {
      await db.from('campaign_targets').update({ estado: 'omitido', error: 'Sin teléfono válido' }).eq('id', t.id)
      continue
    }

    // Cada variable tiene su significado propio. Antes todo lo que no fuera
    // {{1}} recibía el nombre del negocio, que servía mientras las plantillas
    // tenían dos variables — con tres, el {{3}} habría repetido el nombre del
    // negocio dentro de su propio paréntesis.
    const params = paramsDePlantilla(plantilla.ejemplos, lead)

    // El texto REAL que va a recibir el cliente, con las variables ya puestas.
    // Se guarda así y no como "[plantilla] param · param" porque ese marcador
    // era ilegible para Rafael y, peor, Sofía lo veía como el mensaje previo:
    // cuando el cliente respondía, ella no sabía qué le habíamos escrito.
    //
    // Los botones se anotan al final por la misma razón. Cuando llega un
    // "Quiero ver ejemplos" pelado, Sofía tiene que poder ver que eso fue un
    // botón que le ofrecimos nosotros y no una frase que al cliente se le
    // ocurrió — cambia por completo qué toca responder.
    const textoEnviado =
      plantilla.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '') +
      (plantilla.botones?.length ? `\n\n[Botones: ${plantilla.botones.join(' · ')}]` : '')

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
        // El código va ADELANTE del texto. El mensaje de Meta cambia con el
        // idioma y con la versión de la API; el código no. Es lo que permite
        // distinguir después un número sin WhatsApp (131026, culpa del
        // contacto) de una plantilla sin aprobar (132001, culpa nuestra) sin
        // adivinar por palabras. Ver lib/fallosCampana.ts.
        const codigo: number | undefined = datos?.error?.code
        const texto: string = datos?.error?.error_user_msg ?? datos?.error?.message ?? `HTTP ${res.status}`
        const detalle: string = codigo ? `[${codigo}] ${texto}` : texto
        await db.from('campaign_targets').update({ estado: 'fallido', error: detalle.slice(0, 300) }).eq('id', t.id)
        fallidos++

        if (detalle === ultimoError) { seguidos++; idsSeguidos.push(t.id) }
        else { ultimoError = detalle; seguidos = 1; idsSeguidos = [t.id] }

        // Si Meta corta por límite, no seguimos golpeando: el resto queda
        // pendiente para la próxima tanda. Y este también vuelve a la cola —
        // que Meta nos frene a nosotros no es un defecto de su número, y
        // dejarlo en 'fallido' lo sacaba del reparto para siempre.
        if (/rate|limit|too many/i.test(detalle)) {
          await db.from('campaign_targets').update({ estado: 'pendiente' }).eq('id', t.id)
          fallidos--
          break
        }

        if (seguidos >= 3) {
          // Devueltos a la cola: el problema no era de ellos.
          await db.from('campaign_targets')
            .update({ estado: 'pendiente' })
            .in('id', idsSeguidos)
          fallidos -= idsSeguidos.length
          errorSistematico = detalle
          break
        }
        continue
      }

      // Un envío bueno limpia la racha: lo anterior era de ese contacto.
      ultimoError = null
      seguidos = 0
      idsSeguidos = []

      const wamid: string | undefined = datos?.messages?.[0]?.id

      if (convId) {
        await db.from('wa_messages').insert({
          conversation_id: convId, wamid: wamid ?? null,
          direction: 'out', channel: 'cloud_api', msg_type: 'template',
          body: textoEnviado,
          template_name: plantilla.name, status: 'sent', sent_by: user.id,
        })
      }

      await db.from('campaign_targets')
        .update({ estado: 'enviado', wamid: wamid ?? null, enviado_at: new Date().toISOString(), error: null })
        .eq('id', t.id)

      // Pasa a CONTACTADO, no a conversando: le escribimos, todavía no dijo
      // nada. Marcarlo como conversando daba un embudo que mentía —36 en
      // "conversando" con 6 respuestas reales— y borraba el único segmento
      // que importa para reintentar: a quién le escribí y no me contestó.
      await db.from('leads').update({ current_stage: ETAPA_CONTACTADO })
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

  // Avisos por correo. Van con `after()` para no demorar la respuesta: la UI
  // encadena tandas y cada milisegundo acá se multiplica por lote.
  //
  // El de "terminada" solo cuando de verdad no queda nadie en la cola: la UI
  // llama a esta ruta muchas veces por campaña, y un correo por tanda sería
  // ocho correos por campaña. El de "detenida" siempre, porque significa que
  // el envío está parado esperando que alguien lo arregle.
  after(async () => {
    if (errorSistematico) {
      await avisarCampanaDetenida({
        nombre: camp.name ?? 'Campaña',
        motivo: errorSistematico,
        restantes: restantes ?? 0,
      })
    } else if ((restantes ?? 0) === 0 && enviados > 0) {
      await avisarCampanaTerminada({
        nombre: camp.name ?? 'Campaña',
        enviados, fallidos, restantes: restantes ?? 0,
      })
    }
  })

  return NextResponse.json({
    ok: true, enviados, fallidos,
    restantes: restantes ?? 0,
    // Un corte por configuración NO es "terminada": queda gente en la cola.
    terminada: !errorSistematico && (restantes ?? 0) === 0,
    cupoRestante: Math.max(0, cupo - enviados),
    ...(errorSistematico
      ? {
          detenida: true,
          mensaje:
            `Se detuvo el envío: los últimos 3 intentos fallaron igual, así que ` +
            `el problema es de configuración y no de los contactos. Nadie se ` +
            `quemó, siguen en la cola. Meta dijo: "${errorSistematico}"`,
        }
      : {}),
  })
}
