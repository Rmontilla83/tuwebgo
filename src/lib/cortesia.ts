/**
 * Cuándo NO hay que contestar.
 *
 * Caso real, Mia Floristería:
 *
 *   Cliente  "No, gracias"  (botón)
 *   Sofía    "Listo, gracias por avisar. Cualquier día que lo necesites, acá estamos."
 *   Cliente  "Gracias"
 *   Sofía    "De nada, Lesmicar. ¡Que tengas un buen día!"
 *   Cliente  [sticker]
 *   Sofía    "Perfecto, Lesmicar. ¡Que tengas un buen día!"
 *
 * La despedida no terminaba nunca. Cada cortesía del cliente sacaba otra
 * respuesta, y la última contestaba un sticker repitiendo la frase anterior.
 * Entre humanos eso no pasa: alguien dice "gracias" y el otro no responde, y
 * nadie lo toma a mal. Un bot que siempre tiene la última palabra se delata
 * solo — y además cada mensaje cuesta.
 *
 * Esto va en código y no en el prompt a propósito. Ya está escrito ahí que
 * cierre a la primera, y aun así respondió tres veces: pedirle a un modelo
 * que se calle es una probabilidad, no una garantía. Mismo criterio que con
 * los enlaces y los datos de pago.
 */

/** Se le quitan emojis, signos y espacios para ver qué palabras quedan de verdad. */
function palabras(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Todo lo que no sea letra o número se va: emojis, signos, puntuación.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Palabras que por sí solas no piden respuesta.
 *
 * La lista es corta y deliberadamente conservadora: si aparece cualquier otra
 * palabra, el mensaje deja de ser "solo cortesía" y se contesta. Es preferible
 * responder de más a dejar callado a un cliente que sí preguntó algo.
 */
const CORTESIA = new Set([
  'gracias', 'gracia', 'muchas', 'mucho', 'muchisimas', 'igualmente', 'igual',
  'ok', 'oki', 'okey', 'okay', 'listo', 'dale', 'bueno', 'va', 'vale',
  'perfecto', 'excelente', 'genial', 'chevere', 'che', 'bien', 'buenisimo',
  'saludos', 'bendiciones', 'abrazo', 'abrazos', 'suerte', 'exitos', 'exito',
  'amen', 'amen', 'si', 'no', 'nada', 'de', 'a', 'ti', 'usted', 'ustedes',
  'que', 'tengas', 'tenga', 'buen', 'buena', 'buenos', 'buenas', 'dia',
  'dias', 'tarde', 'tardes', 'noche', 'noches', 'hasta', 'luego', 'chao',
  'chau', 'adios', 'cuidate', 'cuidese', 'pendiente', 'claro', 'entiendo',
  'entendido', 'anotado', 'por', 'el', 'la', 'lo', 'les', 'te', 'y', 'mas',
])

/** Tipos que no traen texto y, después de una despedida, no piden respuesta. */
const SIN_TEXTO = new Set(['sticker', 'unsupported'])

export type MensajeEntrante = { body?: string | null; msg_type?: string | null }

/**
 * true = este mensaje es puro trámite social y se puede dejar sin respuesta.
 *
 * Reglas para no equivocarse del lado caro:
 *  · Si trae "?" se contesta, aunque el resto sea cortesía ("gracias, ¿cuánto
 *    cuesta?").
 *  · Si aparece una sola palabra fuera de la lista, se contesta.
 *  · Más de 8 palabras deja de ser una cortesía suelta.
 */
export function esSoloCortesia(m: MensajeEntrante): boolean {
  const tipo = (m.msg_type ?? 'text').toLowerCase()
  const texto = (m.body ?? '').trim()

  // Un sticker o un emoji suelto después de una despedida es un gesto, no una
  // pregunta. Nadie espera que le respondan a un pulgar arriba.
  if (SIN_TEXTO.has(tipo)) return true
  if (tipo !== 'text') return false

  if (!texto) return true
  if (texto.includes('?') || texto.includes('¿')) return false

  const ps = palabras(texto)
  // Sin palabras = solo emojis.
  if (!ps.length) return true
  if (ps.length > 8) return false

  return ps.every((p) => CORTESIA.has(p))
}

/**
 * Si Sofía ya cerró, un "gracias" no reabre nada.
 *
 * Hace falta que ella ya haya hablado: al primer mensaje de alguien —aunque
 * sea un "hola" o un pulgar arriba— siempre se responde. Dejar a un
 * desconocido sin respuesta es otro problema distinto y peor.
 */
export function debeQuedarseCallada(
  entrante: MensajeEntrante,
  yaRespondio: boolean
): boolean {
  return yaRespondio && esSoloCortesia(entrante)
}
