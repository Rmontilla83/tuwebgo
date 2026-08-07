import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractRefCode } from '@/lib/whatsapp'

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
  image?: { id?: string; mime_type?: string }
  audio?: { id?: string; mime_type?: string }
  video?: { id?: string; mime_type?: string }
  document?: { id?: string; mime_type?: string; filename?: string }
  referral?: { source_type?: string; ctwa_clid?: string }
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

  const cuerpo = m.text?.body ?? null
  const media = m.image ?? m.audio ?? m.video ?? m.document
  const tipo = TIPOS_CONOCIDOS.has(m.type) ? m.type : 'unsupported'

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

  // Cierra el bucle de atribución: el mensaje trae [ref:TW-xxxx] del pixel.
  if (cuerpo) await enlazarPorRefCode(db, convId as string, cuerpo)
}

/** Si el mensaje trae un ref code, ata la conversación al lead de esa sesión. */
async function enlazarPorRefCode(db: Db, convId: string, texto: string) {
  const ref = extractRefCode(texto)
  if (!ref) return

  const { data: conv } = await db
    .from('wa_conversations').select('lead_id').eq('id', convId).single()
  if (conv?.lead_id) return // ya tiene lead, no lo pisamos

  const { data: sesion } = await db
    .from('sessions').select('lead_id').eq('ref_code', ref).single()

  if (sesion?.lead_id) {
    await db.from('wa_conversations').update({ lead_id: sesion.lead_id }).eq('id', convId)
  }
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
