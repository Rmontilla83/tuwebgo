import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneVE } from '@/lib/whatsapp'
import { ETAPA_CONTACTADO, ETAPA_CONVERSANDO, ETAPA_PERDIDO } from '@/lib/config'
import { avisarContactoWeb, confirmarContactoAlCliente, type ContactoWeb } from '@/lib/email/correos'

export const runtime = 'nodejs'

/**
 * POST /api/contacto — el formulario de tuwebgo.net.
 *
 * Existe porque Meta bloqueó la cuenta de WhatsApp del negocio el 2026-08-12 y
 * todos los botones de la landing llevaban a ese número. Desde ese día no
 * entró ni salió un solo mensaje: quien escribía se quedaba sin respuesta y
 * nadie se enteraba. El formulario no depende de Meta.
 *
 * Qué hace, en este orden:
 *   1. Busca si ya lo teníamos, por teléfono y después por correo. Los
 *      contactados por campaña vieron tuwebgo.net en la plantilla y pueden
 *      llegar por acá: duplicarlos rompería el embudo.
 *   2. Crea o completa el lead y deja lo que escribió en su historial.
 *   3. Ata la visita al lead con el session_id que manda la landing.
 *   4. Responde, y DESPUÉS le avisa a Rafael y le confirma al cliente.
 *
 * Endpoint PÚBLICO, llamado desde otro dominio y sin nada que autentique a
 * quien escribe. Lo que lo cuida:
 *   · honeypot y tiempo mínimo de llenado, para los bots que llenan todo;
 *   · límite por IP, para el que aprieta "Enviar" en bucle;
 *   · tope de correos por hora, porque la cuenta de Resend es COMPARTIDA con
 *     los otros negocios de Rafael. Si alguien usara esto para mandar correos
 *     a direcciones ajenas, se quemaría la reputación de envío de todos.
 */

/* ── CORS ────────────────────────────────────────────────────────────── */

const ORIGENES = new Set(['https://tuwebgo.net', 'https://www.tuwebgo.net'])

function origenPermitido(origin: string | null): string | null {
  if (!origin) return null
  if (ORIGENES.has(origin)) return origin
  // Para probar la landing servida en local contra `next dev`.
  if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin
  }
  return null
}

function cabeceras(origin: string | null): Record<string, string> {
  const permitido = origenPermitido(origin)
  if (!permitido) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get('origin')) })
}

/* ── Límites ─────────────────────────────────────────────────────────── */

/** Envíos por IP en la ventana. Una persona manda uno; cinco ya es alguien probando. */
const MAX_POR_IP = 5
const VENTANA_IP_MS = 10 * 60_000

/**
 * Correos por hora entre todos los formularios. La landing recibe ~70 visitas
 * al mes: veinte contactos en una hora no es un buen día, es un ataque. Pasado
 * el tope el contacto igual se guarda en el CRM; lo que se corta es el correo.
 */
const TOPE_CORREOS_HORA = 20

/** Menos que esto entre abrir el formulario y enviarlo no lo llena una persona. */
const MS_MINIMO = 1500

/** Todos los campos al tope caben en ~4 KB. */
const MAX_CUERPO = 16_000

/**
 * Con esto empieza cada entrada del historial que deja el formulario. Los dos
 * topes la cuentan por prefijo: no cambiarla sin cambiar esas consultas.
 */
const MARCA = 'Formulario web'

/**
 * Memoria del límite por IP. Dura lo que dure la instancia: no frena a un
 * atacante con muchas IPs, para eso están el tope por hora y el honeypot.
 */
const intentos = new Map<string, number[]>()

function excedeLimite(ip: string): boolean {
  const ahora = Date.now()
  const recientes = (intentos.get(ip) ?? []).filter((t) => ahora - t < VENTANA_IP_MS)
  recientes.push(ahora)
  intentos.set(ip, recientes)
  // Que el mapa no crezca sin fin en una instancia que vive días.
  if (intentos.size > 5000) intentos.clear()
  return recientes.length > MAX_POR_IP
}

/* ── Datos ───────────────────────────────────────────────────────────── */

const TEXTOS = {
  es: {
    datos: 'No pudimos leer el formulario. Recarga la página e intenta de nuevo.',
    nombre: 'Escribe tu nombre.',
    telefono: 'Revisa el número de teléfono: parece incompleto.',
    correo: 'Revisa el correo: parece que falta algo.',
    contacto: 'Déjanos un teléfono o un correo para poder responderte.',
    muchos: 'Recibimos varios envíos seguidos. Espera unos minutos e intenta de nuevo.',
    fallo: 'No pudimos enviarlo. Intenta de nuevo en un momento.',
  },
  en: {
    datos: "We couldn't read the form. Reload the page and try again.",
    nombre: 'Please enter your name.',
    telefono: 'Please check the phone number, it looks incomplete.',
    correo: 'Please check the email address, something seems off.',
    contacto: 'Leave a phone number or an email so we can reply.',
    muchos: 'We received several submissions in a row. Wait a few minutes and try again.',
    fallo: "We couldn't send it. Please try again in a moment.",
  },
}

/** Lo que eligió, dicho para el correo y el historial. */
const PLANES: Record<string, string> = {
  pre_diseno: 'Pre-diseño ($50)',
  landing_page: 'Landing Page (desde $150)',
  sitio_web: 'Sitio Web (desde $250)',
  sitio_pro: 'Sitio Pro ($497)',
  no_se: 'Todavía no sabe, quiere asesoría',
}

/**
 * Los que acepta `leads.plan_interested`. El CHECK es de la migración 001 y no
 * conoce "sitio_pro": mandarlo hace fallar el insert entero. Sin la clave de
 * Postgres no se puede migrar, así que el Sitio Pro queda en el historial.
 */
const PLANES_EN_COLUMNA = new Set(['pre_diseno', 'landing_page', 'sitio_web'])

/**
 * Etapas de las que sale un contacto cuando es él quien nos busca. Es la misma
 * excepción de autoReply para "perdido": el motivo era que no contestaba.
 * Nunca retrocede a nadie que ya esté más adelante.
 */
const ETAPAS_QUE_AVANZAN = new Set(['sin_contactar', ETAPA_CONTACTADO, ETAPA_PERDIDO])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

/** Texto de una línea: sin saltos ni espacios de más, cortado al tope. */
const linea = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

/**
 * El nombre solo se repite en el correo al cliente si parece un nombre. Uno
 * con un enlace o un correo adentro es alguien usando el formulario para
 * mandarle ese texto, con nuestra marca, a la dirección de otro.
 */
function nombreParaSaludo(nombre: string): string | null {
  if (nombre.length > 40 || /https?:|www\.|@|\.[a-z]{2,}|\d{3,}/i.test(nombre)) return null
  return nombre.split(' ')[0]
}

type Existente = {
  id: string
  name: string | null
  business_name: string | null
  email: string | null
  phone: string | null
  plan_interested: string | null
  current_stage: string
}

/* ── POST ────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = cabeceras(origin)
  const responder = (cuerpo: { ok: boolean; error?: string }, status = 200) =>
    NextResponse.json(cuerpo, { status, headers })

  // Un navegador siempre manda Origin en un POST entre dominios. Sin él, o
  // desde otro sitio, no es nuestro formulario.
  if (!origenPermitido(origin)) return responder({ ok: false, error: TEXTOS.es.datos }, 403)
  if (Number(request.headers.get('content-length') ?? 0) > MAX_CUERPO) {
    return responder({ ok: false, error: TEXTOS.es.datos }, 413)
  }

  // Llega como text/plain para que el navegador no haga la consulta previa de
  // CORS, así que se parsea a mano en vez de con request.json().
  let crudo: Record<string, unknown>
  try {
    const texto = await request.text()
    if (texto.length > MAX_CUERPO) throw new Error('cuerpo demasiado grande')
    const parseado: unknown = JSON.parse(texto)
    if (!parseado || typeof parseado !== 'object' || Array.isArray(parseado)) throw new Error('no es un objeto')
    crudo = parseado as Record<string, unknown>
  } catch {
    return responder({ ok: false, error: TEXTOS.es.datos }, 400)
  }

  const idioma: 'es' | 'en' = crudo.idioma === 'en' ? 'en' : 'es'
  const t = TEXTOS[idioma]

  // Honeypot lleno o formulario llenado en un tiempo imposible: se contesta
  // "ok" sin hacer nada. Un error le diría al bot qué lo delató.
  if (linea(crudo.sitio, 200) || (typeof crudo.ms === 'number' && crudo.ms < MS_MINIMO)) {
    return responder({ ok: true })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'
  if (excedeLimite(ip)) return responder({ ok: false, error: t.muchos }, 429)

  const nombre = linea(crudo.nombre, 80)
  const negocio = linea(crudo.negocio, 120) || null
  const telefono = linea(crudo.telefono, 40) || null
  const correo = linea(crudo.correo, 160).toLowerCase() || null
  const planClave =
    typeof crudo.plan === 'string' && Object.hasOwn(PLANES, crudo.plan) ? crudo.plan : null
  const mensaje =
    typeof crudo.mensaje === 'string'
      ? crudo.mensaje
          .replace(/\r\n?/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 1500) || null
      : null
  const origen =
    typeof crudo.origen === 'string' && /^[a-z_]{1,30}$/.test(crudo.origen) ? crudo.origen : null
  const sesion =
    typeof crudo.session_id === 'string' && UUID.test(crudo.session_id) ? crudo.session_id : null
  const refCode =
    typeof crudo.ref_code === 'string' && /^TW-[a-z0-9]{4,8}$/i.test(crudo.ref_code) ? crudo.ref_code : null

  // Las mismas reglas que el navegador: el navegador es del cliente y
  // cualquiera puede saltarse el formulario y postear a mano.
  if (nombre.length < 2) return responder({ ok: false, error: t.nombre }, 400)
  const digitos = telefono ? telefono.replace(/\D/g, '') : ''
  if (telefono && (digitos.length < 7 || digitos.length > 15)) {
    return responder({ ok: false, error: t.telefono }, 400)
  }
  if (correo && !CORREO.test(correo)) return responder({ ok: false, error: t.correo }, 400)
  if (!telefono && !correo) return responder({ ok: false, error: t.contacto }, 400)

  // Un fijo venezolano pasa la validación pero no tiene WhatsApp: e164 queda
  // null y se guarda el número tal como lo escribió. Ante la duda, se acepta.
  const e164 = telefono ? normalizePhoneVE(telefono) : null
  const telefonoGuardado = telefono ? (e164 ? `+${e164}` : telefono) : null
  const planColumna = planClave && PLANES_EN_COLUMNA.has(planClave) ? planClave : null

  const contacto: Omit<ContactoWeb, 'etapaPrevia' | 'guardado'> = {
    nombre,
    negocio,
    telefonoE164: e164,
    telefono,
    correo,
    plan: planClave ? PLANES[planClave] : null,
    mensaje,
    idioma,
    origen,
  }

  const db = createAdminClient()
  let leadId = ''
  let etapaPrevia: string | null = null

  /* 1 y 2. El lead. Si esto falla, lo único que salva el contacto es el correo. */
  try {
    const columnas = 'id, name, business_name, email, phone, plan_interested, current_stage'
    let existente: Existente | null = null

    // Por teléfono primero: es la llave que usan el webhook y las campañas.
    if (e164) {
      const { data, error } = await db.from('leads').select(columnas).eq('phone_e164', e164)
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (error) throw new Error(error.message)
      existente = data as Existente | null
    }
    if (!existente && correo) {
      const { data, error } = await db.from('leads').select(columnas).eq('email', correo)
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (error) throw new Error(error.message)
      existente = data as Existente | null
    }

    if (existente) {
      leadId = existente.id
      etapaPrevia = existente.current_stage

      // Solo se completa lo que falta. Lo que ya estaba lo cargó alguien a mano
      // o vino del scraping, y un formulario no tiene por qué pisarlo.
      const cambios: Record<string, unknown> = {}
      if (!existente.name?.trim()) cambios.name = nombre
      if (!existente.business_name?.trim() && negocio) cambios.business_name = negocio
      if (!existente.email && correo) cambios.email = correo
      if (!existente.phone?.trim() && telefonoGuardado) cambios.phone = telefonoGuardado
      if (!existente.plan_interested && planColumna) cambios.plan_interested = planColumna
      if (ETAPAS_QUE_AVANZAN.has(existente.current_stage)) cambios.current_stage = ETAPA_CONVERSANDO

      if (Object.keys(cambios).length) {
        const { error } = await db.from('leads').update(cambios).eq('id', leadId)
        if (error) throw new Error(error.message)
      }
    } else {
      const fila = {
        name: nombre,
        business_name: negocio,
        phone: telefonoGuardado,
        email: correo,
        source_channel: 'landing_page',
        source_detail: 'formulario_web',
        ref_code: refCode,
        plan_interested: planColumna,
        current_stage: ETAPA_CONVERSANDO,
        es_prueba: false,
      }
      let insercion = await db.from('leads').insert(fila).select('id').single()
      // ref_code es UNIQUE: si esa visita ya quedó atada a otro lead, se guarda sin él.
      if (insercion.error?.code === '23505' && fila.ref_code) {
        insercion = await db.from('leads').insert({ ...fila, ref_code: null }).select('id').single()
      }
      if (insercion.error) throw new Error(insercion.error.message)
      leadId = insercion.data.id
    }
  } catch (e) {
    console.error('[api/contacto] no se guardó el lead:', e instanceof Error ? e.message : e)
    const aviso = await avisarContactoWeb({ ...contacto, etapaPrevia: null, guardado: false })
    return aviso.ok ? responder({ ok: true }) : responder({ ok: false, error: t.fallo }, 500)
  }

  /* De acá en adelante nada es fatal: el lead ya está guardado. */

  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString()
  const haceUnDia = new Date(Date.now() - 86_400_000).toISOString()

  // Se cuentan ANTES de dejar la entrada de este envío en el historial.
  const [enLaHora, delLead] = await Promise.all([
    db.from('lead_activities').select('id', { count: 'exact', head: true })
      .like('content', `${MARCA}%`).gte('created_at', haceUnaHora),
    db.from('lead_activities').select('id', { count: 'exact', head: true })
      .eq('lead_id', leadId).like('content', `${MARCA}%`).gte('created_at', haceUnDia),
  ])
  if (enLaHora.error) console.error('[api/contacto] conteo por hora:', enLaHora.error.message)
  if (delLead.error) console.error('[api/contacto] conteo del lead:', delLead.error.message)
  const correosEnLaHora = enLaHora.count ?? 0
  // Con una confirmación basta. Un segundo correo idéntico al mismo buzón es
  // justo lo que serviría para molestar a alguien usando su dirección.
  const yaConfirmado = (delLead.count ?? 0) > 0

  const historial = [
    idioma === 'en' ? `${MARCA} (versión en inglés)` : MARCA,
    contacto.plan && `Le interesa: ${contacto.plan}`,
    negocio && `Negocio: ${negocio}`,
    telefonoGuardado && `Teléfono: ${telefonoGuardado}`,
    correo && `Correo: ${correo}`,
    mensaje && `Mensaje: ${mensaje}`,
  ].filter(Boolean).join('\n')

  const { error: actErr } = await db.from('lead_activities')
    .insert({ lead_id: leadId, activity_type: 'message', content: historial })
  if (actErr) console.error('[api/contacto] historial:', actErr.message)

  // 3. La visita queda atada al lead, sin adivinar por ventana de tiempo.
  if (sesion) {
    const { error } = await db.from('sessions').update({ lead_id: leadId })
      .eq('id', sesion).is('lead_id', null)
    if (error) console.error('[api/contacto] sesión:', error.message)
  }

  // 4. Los correos salen con la respuesta ya enviada: el cliente no espera a Resend.
  after(async () => {
    if (correosEnLaHora >= TOPE_CORREOS_HORA) {
      console.error(`[api/contacto] tope de ${TOPE_CORREOS_HORA} correos/hora: lead ${leadId} guardado sin avisar`)
      return
    }
    await avisarContactoWeb({ ...contacto, etapaPrevia, guardado: true })
    if (correo && idioma === 'es' && !yaConfirmado) {
      await confirmarContactoAlCliente({ correo, nombre: nombreParaSaludo(nombre), conTelefono: !!telefono })
    }
  })

  return responder({ ok: true })
}
