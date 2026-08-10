import { NextResponse, after } from 'next/server'
import { avisarCampanaTerminada, avisarCampanaDetenida } from '@/lib/email/correos'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANTILLAS } from '@/lib/waTemplates'

export const runtime = 'nodejs'

/**
 * Con qué se rellena el {{1}} de las plantillas ("Hola {{1}}, te escribimos…").
 *
 * Los contactos scrapeados NO traen nombre de persona: Google Maps da el
 * nombre del negocio y nada más. Antes esto caía en `|| 'Hola'` y salía
 * **"Hola Hola, te escribimos de TuWebGo"** — a los 173 contactos. Un saludo
 * roto en el primer mensaje en frío es la forma más rápida de que te marquen
 * como spam.
 *
 * Cuando no hay persona, "qué tal" completa la frase con naturalidad y la
 * personalización real queda en {{2}}, que sí lleva el nombre del negocio y
 * es lo que demuestra que no es un envío masivo ciego.
 */
function saludoDe(lead: { name?: string | null } | null): string {
  const pila = (lead?.name ?? '').trim()
  if (!pila) return 'qué tal'

  const primero = pila.split(/\s+/)[0]
  // Un "nombre" que en realidad es el negocio (viene así de algunas
  // importaciones) tampoco sirve como saludo personal.
  if (primero.length < 2 || primero.length > 20) return 'qué tal'
  return primero
}

type LeadCampana = {
  name?: string | null
  business_name?: string | null
  phone_e164?: string | null
  ciudad?: string | null
  notes?: string | null
}

/**
 * El {{3}}: la prueba de que miramos su negocio y no una lista.
 *
 * En un WhatsApp en frío la pregunta que el cliente se hace antes que
 * cualquier otra es "¿de dónde sacaste mi número?". Si no la respondemos, la
 * responde él solo y la respuesta que se inventa siempre es peor. Un dato
 * concreto y comprobable de SU ficha de Google la cierra de una: nadie cree
 * que un envío masivo ciego sepa cuántas reseñas tiene.
 *
 * Las reseñas van primero porque son el dato más fuerte y el más halagador —
 * 597 reseñas con 4,7 es algo que costó años. Las tienen 150 de los 173
 * contactos. Para el resto queda el rubro con la ciudad, que consta en todos.
 *
 * Va entre paréntesis en la plantilla a propósito: así funciona como etiqueta
 * y ninguna de las variantes necesita artículo. "Encontramos X en Google
 * (Posada en Maracay)" y "(597 reseñas y 4,7 estrellas)" leen igual de bien,
 * y no hay que adivinar si al rubro le toca "un" o "una".
 *
 * El importador dejó todo esto en `notes` como texto libre, no en columnas.
 * Por eso se lee con expresiones regulares, cada una con su salida: si el
 * formato de las notas cambia, la peor consecuencia es un mensaje más
 * genérico, nunca un paréntesis vacío ni un envío roto.
 */
function senalDe(lead: LeadCampana | null): string {
  const notas = lead?.notes ?? ''

  const resenas = Number(notas.match(/(\d+)\s+rese[ñn]as/i)?.[1] ?? 0)

  // Solo se nombran las reseñas cuando son suficientes para ser un elogio.
  //
  // Probando la plantilla contra los 173 contactos reales salieron dos
  // mensajes que no se pueden mandar: "(0 reseñas en Google)" a 23 negocios
  // —el importador guarda el cero como texto, así que la nota dice
  // literalmente "0 reseñas"— y "(3 reseñas y 5 estrellas)". Los dos abren
  // señalando algo flojo de su negocio en el primer contacto. Con 20 y algo
  // el número dice "esto lleva años funcionando"; con tres dice lo contrario,
  // y el silencio siempre es mejor que un elogio que no lo es.
  //
  // Con el corte en 20 son 55 los que llevan reseñas y 118 el rubro, que no
  // afirma nada sobre lo bien o mal que le va a nadie.
  if (resenas >= 20) {
    // La calificación viene con punto de la fuente en inglés. Acá se escribe
    // 4,7 — un "4.7" en un mensaje en español delata que el texto lo armó
    // una máquina con datos importados.
    const nota = notas.match(/calificaci[oó]n\s+([\d.,]+)/i)?.[1]?.replace('.', ',')
    return nota ? `${resenas} reseñas y ${nota} estrellas` : `${resenas} reseñas en Google`
  }

  const rubro = notas.match(/Rubro original:\s*([^·\n]+)/i)?.[1]?.trim()
  const ciudad = lead?.ciudad?.trim()
  if (rubro && ciudad) return `${rubro} en ${ciudad}`
  if (rubro) return rubro
  if (ciudad) return `negocio en ${ciudad}`

  // Último recurso. Sigue siendo cierto: de ahí salió el número.
  return 'tu ficha de Google'
}

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
    const lead = t.leads as LeadCampana | null
    const tel = lead?.phone_e164
    if (!tel) {
      await db.from('campaign_targets').update({ estado: 'omitido', error: 'Sin teléfono válido' }).eq('id', t.id)
      continue
    }

    // Cada variable tiene su significado propio. Antes todo lo que no fuera
    // {{1}} recibía el nombre del negocio, que servía mientras las plantillas
    // tenían dos variables — con tres, el {{3}} habría repetido el nombre del
    // negocio dentro de su propio paréntesis.
    const valores = [saludoDe(lead), lead?.business_name?.trim() || 'tu negocio', senalDe(lead)]
    const params = plantilla.ejemplos.map((_, i) => valores[i] ?? valores[valores.length - 1])

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
        const detalle: string = datos?.error?.error_user_msg ?? datos?.error?.message ?? `HTTP ${res.status}`
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
