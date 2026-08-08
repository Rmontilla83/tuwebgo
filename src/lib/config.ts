/**
 * Constantes del negocio, en un solo lugar.
 *
 * Estaban repartidas por las páginas: cuando el número de WhatsApp cambió al
 * conectar la Cloud API, el generador de UTM de Campañas se quedó apuntando al
 * viejo y habría mandado el tráfico pago al teléfono personal de Rafael, fuera
 * del CRM. Todo lo que pueda cambiar vive acá.
 */

/** Número público del negocio, E.164 sin "+". El conectado a la Cloud API. */
export const WHATSAPP_NEGOCIO = '584220415281'

/** Link wa.me base del negocio. */
export const WA_BASE = `https://wa.me/${WHATSAPP_NEGOCIO}`

/** Dominio público de la landing. */
export const SITIO = 'https://tuwebgo.net'

/**
 * A qué etapa pasa el lead cuando Sofía detecta cada situación.
 *
 * Sofía SOLO puede mover el lead en la parte de la conversación que ella
 * controla. Todo lo que viene después de que entra dinero —pre-diseño hecho,
 * diseño aprobado, sitio entregado— depende de hechos del mundo real que ella
 * no puede verificar, y lo marca Rafael.
 *
 * Un valor null significa "no toques la etapa".
 */
export const ETAPA_POR_HANDOFF: Record<string, string | null> = {
  quiere_comprar: 'aprobado',   // decidió: hay que cobrarle
  queja: null,
  fuera_de_alcance: null,
  pide_humano: null,
}

/** Etapa a la que pasa un lead en cuanto empieza a conversar con Sofía. */
export const ETAPA_CONVERSANDO = 'contactado'
