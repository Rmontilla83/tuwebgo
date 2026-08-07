/**
 * WhatsApp — Fase 0
 *
 * Atención por WhatsApp desde el CRM SIN depender de la API de Meta:
 * deep links wa.me con el mensaje ya redactado, y cada envío queda registrado
 * en `lead_activities` para que el timeline del lead refleje la conversación.
 *
 * Las plantillas de aquí son las mismas que después van a aprobación de Meta
 * en la Fase 1, por eso cada una lleva su `metaCategory`: las UTILITY son
 * transaccionales (responden a algo que el cliente hizo) y salen ~6x más
 * baratas que las MARKETING. Escribirlas bien ahora ahorra plata después.
 */

// ─────────────────────────────────────────────────────────────
// Teléfonos
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza un teléfono venezolano a E.164 sin el "+" (formato que espera wa.me).
 * Acepta: 04141234567 · 0414-123-4567 · +58 414 1234567 · 584141234567 · 4141234567
 * Devuelve null si no es un móvil venezolano válido.
 *
 * REGLA: en Venezuela los móviles empiezan por 4 (04xx) y los fijos por 2 (02xx).
 * Validamos por eso y NO por una lista de prefijos.
 *
 * La primera versión usaba la lista ['412','414','416','424','426'] y dejó fuera
 * al 0422 — que es justamente el prefijo del número que TuWebGo registró en Meta,
 * más 5 leads de la base. Una lista blanca de prefijos envejece cada vez que
 * CONATEL asigna uno nuevo, y el modo de falla es el peor posible: rechazar en
 * silencio el número de un cliente real. Aceptar un 4xx inexistente no cuesta
 * nada — WhatsApp simplemente no entrega.
 */
export function normalizePhoneVE(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')

  if (d.startsWith('58')) d = d.slice(2)        // +58 / 58
  else if (d.startsWith('0')) d = d.slice(1)    // 0414...

  // Quedan 10 dígitos: prefijo(3) + número(7), y el prefijo arranca en 4.
  if (d.length !== 10) return null
  if (d[0] !== '4') return null

  return `58${d}`
}

/** Formato legible: 0414-123.4567 */
export function formatPhoneVE(raw: string | null | undefined): string {
  const n = normalizePhoneVE(raw)
  if (!n) return raw || '—'
  const d = n.slice(2)
  return `0${d.slice(0, 3)}-${d.slice(3, 6)}.${d.slice(6)}`
}

/** Link wa.me con el mensaje precargado. Devuelve null si el teléfono no sirve. */
export function waLink(phone: string | null | undefined, message: string): string | null {
  const n = normalizePhoneVE(phone)
  if (!n) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`
}

/**
 * Extrae el ref code TW-xxxx de un mensaje pegado desde WhatsApp.
 *
 * Toma la PRIMERA coincidencia a propósito: el pixel de la landing tiene un bug
 * conocido que inyecta el código varias veces en el mismo texto
 * ("...web [ref:TW-a1b2] [ref:TW-a1b2]").
 *
 * El formato que guarda la base es prefijo "TW-" en mayúscula y sufijo en
 * minúscula (verificado: TW-1f8g, TW-hux0, TW-wm3b). Normalizamos a eso para
 * que el match contra sessions.ref_code funcione aunque el usuario pegue el
 * texto con otra capitalización.
 */
export function extractRefCode(text: string): string | null {
  const m = text.match(/TW-[A-Za-z0-9]{4,}/i)
  return m ? `TW-${m[0].slice(3).toLowerCase()}` : null
}

// ─────────────────────────────────────────────────────────────
// Plantillas
// ─────────────────────────────────────────────────────────────

export type TemplateVars = {
  nombre?: string | null
  negocio?: string | null
  plan?: string | null
  monto?: number | null
}

export type WaTemplate = {
  id: string
  label: string
  /** Etapas del pipeline donde esta plantilla tiene sentido. */
  stages: string[]
  /** Categoría con la que iría a aprobación de Meta en la Fase 1. */
  metaCategory: 'UTILITY' | 'MARKETING'
  build: (v: TemplateVars) => string
}

const PLAN_NOMBRE: Record<string, string> = {
  pre_diseno: 'el pre-diseño',
  landing_page: 'la Landing Page',
  sitio_web: 'el Sitio Web',
}

/** Primer nombre, o un saludo genérico si no hay nombre cargado. */
function saludo(v: TemplateVars): string {
  const n = (v.nombre || '').trim().split(/\s+/)[0]
  return n ? `Hola ${n}` : 'Hola'
}

function plan(v: TemplateVars): string {
  return PLAN_NOMBRE[v.plan || ''] || 'tu página web'
}

export const WA_TEMPLATES: WaTemplate[] = [
  {
    id: 'primer_contacto',
    label: 'Primer contacto',
    stages: ['nuevo'],
    metaCategory: 'UTILITY',
    build: (v) =>
      `${saludo(v)}! Soy Rafael de TuWebGo 👋\n\n` +
      `Vi que escribiste por ${plan(v)}${v.negocio ? ` para ${v.negocio}` : ''}. ` +
      `¿Te cuento cómo funciona en 2 minutos?\n\n` +
      `Te hago un pre-diseño de tu página por $50. Si no te gusta, te devuelvo el dinero completo, sin preguntas.`,
  },
  {
    id: 'seguimiento',
    label: 'Seguimiento',
    stages: ['contactado'],
    metaCategory: 'UTILITY',
    build: (v) =>
      `${saludo(v)}, ¿cómo va todo?\n\n` +
      `Te escribo para saber si pudiste pensar lo de ${plan(v)}${v.negocio ? ` para ${v.negocio}` : ''}. ` +
      `Cualquier duda que tengas la respondo con gusto — sin compromiso.`,
  },
  {
    id: 'pre_diseno_enviado',
    label: 'Pre-diseño enviado',
    stages: ['pre_diseno_enviado'],
    metaCategory: 'UTILITY',
    build: (v) =>
      `${saludo(v)}! Ya te mandé el pre-diseño ✅\n\n` +
      `Míralo con calma y dime qué te gustaría cambiar: colores, textos, secciones, lo que sea. ` +
      `Ajustamos hasta que quede como lo imaginas.`,
  },
  {
    id: 'cierre',
    label: 'Cierre / cobro',
    stages: ['aprobado'],
    metaCategory: 'UTILITY',
    build: (v) =>
      `${saludo(v)}! Perfecto, entonces arrancamos 🚀\n\n` +
      (v.monto ? `El total es $${v.monto}.\n\n` : '') +
      `Puedes pagar por Zelle, Binance, PayPal, Zinli o pago móvil — el que te quede más cómodo. ` +
      `Apenas confirmes, empiezo de una vez.`,
  },
  {
    id: 'entrega',
    label: 'Entrega',
    stages: ['pagado', 'entregado'],
    metaCategory: 'UTILITY',
    build: (v) =>
      `${saludo(v)}! Tu página ya está en línea 🎉\n\n` +
      `Échale un ojo y dime si quieres ajustar algo. ` +
      `Cualquier cosa que necesites después, aquí estoy.`,
  },
  {
    id: 'reactivacion',
    label: 'Reactivación',
    stages: ['perdido', 'contactado', 'nuevo'],
    metaCategory: 'MARKETING',
    build: (v) =>
      `${saludo(v)}! ¿Cómo va${v.negocio ? ` ${v.negocio}` : ''}?\n\n` +
      `Te escribo por si todavía te interesa lo de la página web. ` +
      `Sigo con el pre-diseño de $50 con garantía de devolución.\n\n` +
      `Si ya no aplica, dime y no te escribo más 🙌`,
  },
  {
    id: 'pedir_datos',
    label: 'Pedir datos',
    stages: ['nuevo', 'contactado', 'pre_diseno_enviado', 'aprobado'],
    metaCategory: 'UTILITY',
    build: (v) =>
      `${saludo(v)}! Para avanzar necesito unas cositas:\n\n` +
      `1. Logo (si tienes)\n` +
      `2. Fotos de tus productos o del local\n` +
      `3. Textos: qué haces, dónde estás, horarios\n` +
      `4. Redes sociales y WhatsApp de contacto\n\n` +
      `Con eso te tengo el pre-diseño listo rápido.`,
  },
]

/** Plantillas aplicables a la etapa dada, con la más relevante primero. */
export function templatesForStage(stage: string): WaTemplate[] {
  const exact = WA_TEMPLATES.filter((t) => t.stages[0] === stage)
  const rest = WA_TEMPLATES.filter((t) => t.stages[0] !== stage && t.stages.includes(stage))
  const others = WA_TEMPLATES.filter((t) => !t.stages.includes(stage))
  return [...exact, ...rest, ...others]
}
