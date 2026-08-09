import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractRefCode } from '@/lib/whatsapp'
import { after } from 'next/server'
import { responderAutomatico } from '@/lib/autoReply'
import { descargarMedia, transcribirAudio } from '@/lib/waMedia'

export const runtime = 'nodejs'
// Meta reintenta hasta 36h si no recibe 200 rápido. Nada de cachear.
export const dynamic = 'force-dynamic'

/* ─────────────────────────────────────────────────────────────
   GET — apretón de manos de verificación
   Meta llama con hub.mode / hub.verify_token / hub.challenge y espera
   el challenge devuelto en TEXTO PLANO. Si lo envolvemos en JSON,
   rechaza la URL.
   ───────────────────────────────────────────────────────────── */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const esperado = process.env.WHATSAPP_VERIFY_TOKEN
  if (!esperado) {
    console.error('[wa-webhook] falta WHATSAPP_VERIFY_TOKEN')
    return new Response('Server misconfigured', { status: 500 })
  }

  if (mode === 'subscribe' && token === esperado && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[wa-webhook] verificación fallida', { mode, coincide: token === esperado })
  return new Response('Forbidden', { status: 403 })
}

/* ─────────────────────────────────────────────────────────────
   Firma
   Meta firma cada POST con HMAC-SHA256 del cuerpo CRUDO usando el
   App Secret. Hay que calcularlo sobre el texto exacto recibido: si
   se parsea a JSON y se vuelve a serializar, cambia y no coincide.
   ───────────────────────────────────────────────────────────── */
function firmaValida(cuerpoCrudo: string, cabecera: string | null, appSecret: string): boolean {
  if (!cabecera?.startsWith('sha256=')) return false

  const recibida = Buffer.from(cabecera.slice(7), 'hex')
  const calculada = createHmac('sha256', appSecret).update(cuerpoCrudo, 'utf8').digest()

  // timingSafeEqual explota si los largos difieren; hay que comprobarlo antes.
  if (recibida.length !== calculada.length) return false
  return timingSafeEqual(recibida, calculada)
}

type MetaMensaje = {
  id: string
  from: string
  timestamp?: string
  type: string
  text?: { body?: string }
  // El caption viene DENTRO del objeto del medio, no en `text`. Por leer solo
  // `text.body` se perdía: si el cliente manda el comprobante con
  // "referencia 004521887" escrito en el pie de la foto, ese número no
  // quedaba registrado en ninguna parte.
  image?: { id?: string; mime_type?: string; caption?: string }
  audio?: { id?: string; mime_type?: string; voice?: boolean }
  video?: { id?: string; mime_type?: string; caption?: string }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
  referral?: { source_type?: string; ctwa_clid?: string }
  /** Respuesta a un botón de plantilla: llega como type "button". */
  button?: { text?: string; payload?: string }
  /** Respuesta a un botón o lista de un mensaje interactivo. */
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string; description?: string }
  }
}

/**
 * Lo que el cliente escribió, venga como venga.
 *
 * Tocar un botón NO llega como `text`: llega como type "button" con el rótulo
 * en `button.text`, o como "interactive" si el mensaje no era una plantilla.
 * Leyendo solo `text.body`, una respuesta por botón se guardaba con el cuerpo
 * vacío y Sofía contestaba sin saber qué le habían dicho — justo en el primer
 * mensaje de un contacto en frío, que es donde menos se puede fallar.
 *
 * Para el cliente tocar un botón es responder, así que el rótulo se guarda
 * como texto normal. Es además el único tipo que el CHECK de wa_messages
 * acepta sin migración, y una migración que no se aplique a tiempo haría que
 * el mensaje reventara y se perdiera: exactamente lo que se quiere evitar.
 */
function textoDelCliente(m: MetaMensaje): string | null {
  const boton =
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title
  if (boton?.trim()) return boton.trim()

  const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption
  return m.text?.body ?? caption ?? null
}

type MetaEstado = {
  id: string
  status: string
  errors?: { title?: string; message?: string }[]
  pricing?: { category?: string; billable?: boolean }
}

const TIPOS_CONOCIDOS = new Set([
  'text', 'image', 'audio', 'video', 'document', 'sticker', 'location',
])

/* ─────────────────────────────────────────────────────────────
   POST — mensajes y estados entrantes
   ───────────────────────────────────────────────────────────── */
export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error('[wa-webhook] falta META_APP_SECRET')
    return new Response('EVENT_RECEIVED', { status: 200 })
  }

  // El cuerpo crudo se lee UNA sola vez y antes de cualquier parseo.
  const crudo = await request.text()

  if (!firmaValida(crudo, request.headers.get('x-hub-signature-256'), appSecret)) {
    console.warn('[wa-webhook] firma inválida — descartado')
    return new Response('Forbidden', { status: 403 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(crudo)
  } catch {
    console.warn('[wa-webhook] cuerpo no es JSON')
    return new Response('EVENT_RECEIVED', { status: 200 })
  }

  const db = createAdminClient()

  // Guardamos el payload crudo pase lo que pase. Salva horas cuando un mensaje
  // no aparece y hay que demostrar que sí llegó.
  const { data: evento } = await db
    .from('wa_webhook_events')
    .insert({ payload })
    .select('id')
    .single()

  try {
    await procesar(db, payload)
    if (evento?.id) {
      await db.from('wa_webhook_events').update({ processed: true }).eq('id', evento.id)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[wa-webhook] error procesando:', msg)
    if (evento?.id) {
      await db.from('wa_webhook_events').update({ error: msg }).eq('id', evento.id)
    }
  }

  // SIEMPRE 200. Si devolvemos error, Meta reintenta 36h y termina
  // desactivando la suscripción del webhook.
  return new Response('EVENT_RECEIVED', { status: 200 })
}

type Db = ReturnType<typeof createAdminClient>

async function procesar(db: Db, payload: unknown) {
  const entries = (payload as { entry?: unknown[] })?.entry
  if (!Array.isArray(entries)) return

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes
    if (!Array.isArray(changes)) continue

    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value
      if (!value) continue

      const contactos = (value.contacts as { wa_id?: string; profile?: { name?: string } }[]) ?? []
      const nombrePerfil = contactos[0]?.profile?.name ?? null

      for (const m of (value.messages as MetaMensaje[]) ?? []) {
        await guardarEntrante(db, m, nombrePerfil)
      }
      for (const s of (value.statuses as MetaEstado[]) ?? []) {
        await actualizarEstado(db, s)
      }
    }
  }
}

async function guardarEntrante(db: Db, m: MetaMensaje, nombrePerfil: string | null) {
  // wa_get_or_create_conversation normaliza el teléfono y enlaza con el lead
  // que tenga ese número, si existe.
  const { data: convId, error: convErr } = await db.rpc('wa_get_or_create_conversation', {
    p_phone: m.from,
    p_lead_id: null,
  })
  if (convErr || !convId) {
    throw new Error(`No se pudo abrir conversación para ${m.from}: ${convErr?.message}`)
  }

  const media = m.image ?? m.audio ?? m.video ?? m.document

  // El caption de una foto o un documento ES texto del cliente y vale igual
  // que un mensaje. Antes se descartaba. Lo mismo vale para el rótulo de un
  // botón: ver textoDelCliente.
  const cuerpo = textoDelCliente(m)

  const esBoton = m.type === 'button' || m.type === 'interactive'
  const tipo = esBoton ? 'text' : TIPOS_CONOCIDOS.has(m.type) ? m.type : 'unsupported'

  // ON CONFLICT sobre wamid: Meta reintenta el mismo mensaje hasta 36h.
  const { error: msgErr } = await db
    .from('wa_messages')
    .upsert(
      {
        conversation_id: convId,
        wamid: m.id,
        direction: 'in',
        channel: 'cloud_api',
        msg_type: tipo,
        body: cuerpo,
        media_mime: media?.mime_type ?? null,
        // El id, no la URL: la URL de descarga de Meta vence a los ~5 minutos.
        // Con el id se puede reintentar durante los ~30 días que Meta guarda
        // el archivo.
        media_id: media?.id ?? null,
        status: 'delivered',
        created_at: m.timestamp
          ? new Date(Number(m.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      },
      { onConflict: 'wamid', ignoreDuplicates: true }
    )
  if (msgErr) throw new Error(`No se pudo guardar el mensaje: ${msgErr.message}`)

  const parche: Record<string, unknown> = {}
  if (nombrePerfil) parche.display_name = nombrePerfil

  // Click-to-WhatsApp abre una ventana de entrada gratuita de 72h.
  if (m.referral?.source_type) {
    parche.fep_expires_at = new Date(Date.now() + 72 * 3600 * 1000).toISOString()
  }

  if (Object.keys(parche).length) {
    await db.from('wa_conversations').update(parche).eq('id', convId)
  }

  // Cierra el bucle de atribución: crea el lead si no existe, engancha la
  // conversación, y ata la sesión web al lead para no perder UTMs.
  //
  // El ref code ya NO viaja en el mensaje (le ensuciaba el texto al cliente),
  // así que hay dos caminos:
  //  1. Si el mensaje trae uno, es de un enlace viejo todavía en circulación:
  //     se usa, porque es atribución exacta.
  //  2. Si no, se correlaciona por ventana de tiempo con el cta_click que quedó
  //     registrado en `events`. Meta no manda nada sobre el origen en clics
  //     orgánicos de wa.me — verificado sobre 150 webhooks, cero con `referral`.
  const refDelMensaje = cuerpo ? extractRefCode(cuerpo) : null

  // ORDEN IMPORTANTE: primero la ventana, después el cierre genérico.
  // Al revés, wa_cerrar_atribucion creaba el lead con source_channel
  // 'organic_wa' y cuando la ventana identificaba la sesión de la landing ya
  // era tarde: el lead existía y el canal quedaba mal. Toda visita de la web
  // se contaba como WhatsApp directo.
  if (!refDelMensaje) {
    const { error: venErr } = await db.rpc('wa_atribuir_por_ventana', {
      p_conv_id: convId,
      p_minutos: 45,
    })
    // Best-effort: no encontrar la sesión de origen es un resultado legítimo.
    if (venErr) console.error('[wa-webhook] atribución por ventana:', venErr.message)
  }

  const { error: attrErr } = await db.rpc('wa_cerrar_atribucion', {
    p_conv_id: convId,
    p_ref_code: refDelMensaje,
    p_nombre: nombrePerfil,
  })

  // Se RELANZA en vez de solo loguear. Cuando la migración 008 renombró las
  // etapas, esta función quedó insertando un slug inexistente y ningún WhatsApp
  // de un número nuevo pudo crear su lead — durante horas y sin una sola señal,
  // porque el error moría en un console.error que nadie mira. Ahora sube al
  // catch de POST, que lo escribe en wa_webhook_events.error.
  if (attrErr) throw new Error(`atribución: ${attrErr.message}`)

  // El bot contesta solo, pero DESPUÉS de responderle 200 a Meta.
  //
  // Antes esto se esperaba acá adentro y el 200 salía recién cuando Gemini
  // terminaba: 1 a 3 segundos, y con una nota de voz —que hay que bajar y
  // transcribir— pasa de 10. Meta reintenta el webhook cuando tarda, y cada
  // reintento es otro mensaje al cliente.
  //
  // `after` de Next 16 corre el trabajo con la respuesta ya enviada.
  after(async () => {
    try {
      // Si vino una nota de voz, primero hay que saber qué dice: sin eso
      // Sofía ve "[audio]" y contesta cualquier cosa.
      if (m.type === 'audio' && media?.id) {
        await procesarAudio(db, m.id, media.id)
      }
      await responderAutomatico(db, convId as string)
    } catch (e) {
      console.error('[wa-webhook] trabajo diferido:', e instanceof Error ? e.message : e)
    }
  })
}

/**
 * Baja la nota de voz, la guarda y la transcribe sobre el mismo mensaje.
 *
 * El orden importa: primero se guarda el archivo y después se transcribe. Si
 * la transcripción falla, al menos el audio quedó y se puede escuchar desde el
 * inbox — que es peor que tenerlo transcrito, pero mucho mejor que un
 * "[audio]" sin nada detrás.
 */
async function procesarAudio(db: Db, wamid: string, mediaId: string) {
  const token = process.env.WHATSAPP_TOKEN
  const apiKey = process.env.GEMINI_API_KEY
  if (!token) return

  const archivo = await descargarMedia(mediaId, token)
  if (!archivo) return

  const ext = archivo.mime.includes('mpeg') ? 'mp3' : archivo.mime.includes('mp4') ? 'm4a' : 'ogg'
  const ruta = `audio/${mediaId}.${ext}`

  const { error: upErr } = await db.storage
    .from('wa-media')
    .upload(ruta, archivo.datos, { contentType: archivo.mime.split(';')[0], upsert: true })

  if (upErr) console.error('[wa-webhook] subir audio:', upErr.message)
  else await db.from('wa_messages').update({ media_path: ruta }).eq('wamid', wamid)

  if (!apiKey) return

  const t = await transcribirAudio({
    apiKey,
    modelo: process.env.GEMINI_MODEL,
    datos: archivo.datos,
    mime: archivo.mime,
  })
  if (!t) return

  // El costo del audio se registra aparte: son ~32 tokens por segundo y a otro
  // precio que el texto. Mezclarlo daría un total más bajo que la factura.
  await db.from('ia_uso').insert({
    modelo: t.modelo, contexto: 'transcripcion',
    tokens_in: t.tokensIn, tokens_out: t.tokensOut,
  })

  // Aunque salga [inaudible] se guarda: en el inbox es más honesto ver "no se
  // entendió" que ver el mensaje vacío y no saber si falló algo.
  await db.from('wa_messages')
    .update({ body: t.texto, transcrito: true })
    .eq('wamid', wamid)
}

async function actualizarEstado(db: Db, s: MetaEstado) {
  const parche: Record<string, unknown> = { status: s.status }

  // El costo real llega acá, en pricing.category — y NO siempre coincide con la
  // categoría declarada al crear la plantilla. Meta puede recategorizar.
  if (s.pricing?.category) parche.pricing_category = s.pricing.category
  if (typeof s.pricing?.billable === 'boolean') parche.billable = s.pricing.billable
  if (s.errors?.length) {
    parche.error_detail = s.errors.map((e) => e.title ?? e.message).filter(Boolean).join(' · ')
  }

  await db.from('wa_messages').update(parche).eq('wamid', s.id)
}
