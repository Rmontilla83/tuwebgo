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
 * Los trabajos que se pueden mandar cuando alguien pide ver ejemplos.
 *
 * Son sitios REALES y en línea, no capturas ni maquetas. Esa es toda la
 * gracia: en un primer contacto en frío el cliente no está evaluando el
 * diseño, está evaluando si existimos. Un dominio que abre en un toque
 * resuelve esa pregunta más rápido que cualquier argumento.
 *
 * Las direcciones viven acá y no en el prompt porque son cadenas exactas.
 * Sofía ELIGE cuáles pegan con el negocio del cliente; quien las ESCRIBE es
 * el código. Un dominio con una letra cambiada es un 404, y un 404 en el
 * mensaje donde estamos demostrando que somos reales prueba lo contrario.
 * En las pruebas los mezclaba entre sí y salían "fortius.net" o "atryum.fit".
 *
 * Los siete verificados en línea el 2026-08-09 (todos 200). Ojo con MiloApp:
 * es miloapp.fit, no milo.fit — ese segundo da 404.
 */
export const SITIOS = {
  wuipi:    { nombre: 'Wuipi',    url: 'https://wuipi.net',                 que: 'plataforma digital' },
  catemve:  { nombre: 'CATEMVE',  url: 'https://catemve.com',               que: 'sitio institucional' },
  miloapp:  { nombre: 'MiloApp',  url: 'https://miloapp.fit',               que: 'landing de una app de fitness' },
  proyben:  { nombre: 'Proyben',  url: 'https://proyben.com',               que: 'empresa de servicios, varias páginas' },
  atryum:   { nombre: 'Atryum',   url: 'https://atryum.net',                que: 'app de condominios' },
  fortius:  { nombre: 'Fortius',  url: 'https://fortius.fit',               que: 'entrenamiento personalizado' },
  fueguito: { nombre: 'Fueguito', url: 'https://eluniversodefueguito.com',  que: 'marca infantil con tienda' },
} as const

export type ClaveSitio = keyof typeof SITIOS

export const CLAVES_SITIOS = Object.keys(SITIOS) as ClaveSitio[]

/** Si Sofía no eligió ninguno, estos tres: los más distintos entre sí. */
const POR_DEFECTO: ClaveSitio[] = ['atryum', 'fueguito', 'fortius']

/**
 * Bloque listo para pegar al final de un mensaje de WhatsApp.
 *
 * Se topa en cuatro a propósito. Siete enlaces seguidos en un WhatsApp son
 * una pared que nadie abre; tres o cuatro elegidos para ese negocio se ven
 * como una recomendación.
 */
export function bloquePortafolio(claves: readonly string[] = []): string {
  const validas = claves.filter((c): c is ClaveSitio => c in SITIOS)
  const elegidas = [...new Set(validas.length ? validas : POR_DEFECTO)].slice(0, 4)

  const lineas = elegidas.map((c) => `${SITIOS[c].nombre} — ${SITIOS[c].url}`)
  return (
    `Estos son trabajos nuestros, échales un ojo:\n${lineas.join('\n')}\n\n` +
    `Y acá está todo lo demás: ${SITIO}`
  )
}

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

/**
 * El cliente dijo que no.
 *
 * Es terminal a propósito: el movimiento de etapas solo avanza por
 * `sort_order` y perdido es el 99, así que de acá no sale solo. Si alguien
 * cambia de opinión, Rafael arrastra la tarjeta en el pipeline. Eso es
 * deliberado — que un "no" se deshaga automáticamente es como se termina
 * escribiéndole otra vez a quien pidió que no le escriban.
 */
export const ETAPA_PERDIDO = 'perdido'
