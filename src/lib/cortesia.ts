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
 * Un "no" explícito. Se detecta en código porque lo prometemos por escrito.
 *
 * El pie de cada plantilla en frío dice "Responde BAJA y no te escribimos
 * más", y la nueva trae un botón "No, gracias". Eso es un compromiso, y
 * cumplirlo no puede depender de que un modelo interprete bien la intención:
 * una persona que pidió que no le escriban y recibe otra campaña reporta el
 * número, y el número es lo más caro de reemplazar.
 *
 * OJO: "No, gracias" también pasa el filtro de cortesía —son dos palabras de
 * la lista— así que esto TIENE que evaluarse antes, o un rechazo se quedaría
 * sin la respuesta de cierre que el cliente merece.
 */
const RECHAZO =
  /^(\s*)(baja|no,?\s*gracias|no\s+me\s+interesa|no\s+gracias|no\s+quiero|quit[ae]me|s[aá]came|no\s+escrib\w*\s*m[aá]s|d[eé]jame\s+en\s+paz|stop|unsubscribe)([\s.!]*)$/i

/**
 * "Quítame", "sácame", "bórrame" abriendo el mensaje.
 *
 * Se aceptan con lo que venga detrás ("quítame de la lista", "sácame por
 * favor"): exigir la frase exacta dejaba pasar las dos formas más comunes.
 *
 * La excepción es que traiga una pregunta, porque ahí probablemente esté
 * pidiendo algo y no rechazando ("¿me sacas una cotización?").
 *
 * Acá se prefiere marcar de más. Dejar de escribirle a alguien que no quería
 * irse cuesta un lead; seguir escribiéndole a quien pidió que pares cuesta un
 * reporte a Meta, y con eso el número.
 */
const SACAME = /^\s*(qu[ií]t[ae]me|s[aá]c[ae]me|b[oó]rr[ae]me|elim[ií]name|remu[eé]veme)\b/i

export function esRechazoExplicito(m: MensajeEntrante): boolean {
  const t = (m.body ?? '').trim()
  if (!t) return false
  if (RECHAZO.test(t)) return true
  if (SACAME.test(t) && !t.includes('?') && !t.includes('¿')) return true
  // Frases un poco más largas que igual son un no rotundo.
  return /\bno\s+(me\s+)?(interesa|quiero nada)\b|\bno\s+me\s+escrib\w+\b/i.test(t)
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
