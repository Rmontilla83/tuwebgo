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
  quiere_comprar: 'por_cobrar',   // decidió: hay que cobrarle los $50
  // Sigue en "por cobrar" a propósito. El cliente DIJO que pagó; nadie lo
  // verificó todavía. Mover el lead por el dicho del cliente ensucia el
  // embudo y, peor, hace que un pago que nunca entró parezca cobrado.
  // Rafael lo mueve cuando ve la plata en la cuenta.
  pago_reportado: 'por_cobrar',
  queja: null,
  fuera_de_alcance: null,
  pide_humano: null,
}

/**
 * Cuáles de esas señales además PAUSAN el bot y llaman a Rafael.
 *
 * `quiere_comprar` quedó deliberadamente afuera: antes frenaba ahí y Rafael
 * tenía que aparecer a mandar un Zelle a mano — el cuello de botella que hacía
 * que 57 de 58 interesados no llegaran nunca a pagar. Ahora Sofía entrega los
 * datos y sigue atendiendo dudas.
 *
 * `pago_reportado` sí pausa: es plata, y plata la confirma una persona.
 */
export const HANDOFF_PAUSA_BOT = new Set([
  'pago_reportado',
  'queja',
  'fuera_de_alcance',
  'pide_humano',
])

/** Etapa a la que pasa un lead en cuanto empieza a conversar con Sofía. */
export const ETAPA_CONVERSANDO = 'conversando'
