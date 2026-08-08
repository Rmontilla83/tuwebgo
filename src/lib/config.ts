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
