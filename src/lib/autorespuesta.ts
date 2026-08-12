/**
 * Reconocer el autorespondedor de un negocio.
 *
 * Casi todos los contactos de la lista tienen WhatsApp Business con respuesta
 * automática. Cuando les llega la plantilla, su sistema contesta solo — y
 * Sofía lo tomaba por una persona y se ponía a conversar.
 *
 * Medido sobre los primeros 66 envíos de la plantilla nueva:
 *
 *   19 negocios contestaron con un autorespondedor
 *    5 rechazaron con el botón
 *    3 mostraron interés real
 *
 * De las 35 respuestas que mandó Sofía, unas 24 fueron a robots. A cuatro
 * negocios les escribió DOS veces, porque el autorespondedor disparó dos
 * veces. El dueño abre el chat al otro día y ve dos mensajes nuestros que
 * nadie pidió: eso es exactamente lo que hace que a uno lo bloqueen.
 *
 * Y ensucia la única métrica que importa en frío. El trigger de la base marca
 * `respondio` con cualquier entrante, así que el panel decía 26 respuestas
 * cuando de verdad eran 3.
 *
 * LA CLAVE SEMÁNTICA: el autorespondedor nos saluda A NOSOTROS como si
 * fuéramos SU cliente. "Gracias por comunicarte con Floristería JR, ¿cómo
 * podemos ayudarte?" no es algo que escriba un dueño respondiendo a una
 * oferta. Por eso se detecta por esa forma y no por longitud ni por emojis.
 */

/** Frases con las que un negocio recibe a un cliente que le acaba de escribir. */
const RECIBIMIENTO = [
  /gracias por (comunicarte|contactar|contactarnos|tu mensaje|escribir|escribirme|preferirnos)/i,
  /bienvenid[oa@]|te damos la bienvenida|le da la bienvenida|les da la bienvenida/i,
  /\bse comunica con\b/i,
  /(en este momento|ahora) no (podemos|puedo) (responder|atender)/i,
  /(nuestro|el) horario de atenci[oó]n|le recordamos que nuestro horario/i,
  /responderemos (a la brevedad|lo antes posible|en breve)/i,
  /(estamos|me encuentro) (fuera|ausente|recargando)/i,
  /[¿?]\s*(c[oó]mo|en qu[eé]) (podemos|puedo) ayudarte/i,
  /mensaje autom[aá]tico|respuesta autom[aá]tica/i,
]

/**
 * Señales de que del otro lado hay una persona interesada.
 *
 * Es el escape: si aparece cualquiera de estas, se responde aunque el mensaje
 * empiece con "gracias por escribirme", que es algo que una persona real sí
 * puede decir.
 *
 * OJO CON LO GENÉRICO. La primera versión incluía "página" a secas y se comió
 * un autorespondedor de floristería que decía "visítanos en nuestra página de
 * Instagram". Casi todo negocio tiene una "página" de Instagram o Facebook,
 * así que la palabra sola no dice nada: tiene que ser una página WEB, o una
 * señal de intención clara.
 */
const INTERES_REAL = new RegExp(
  [
    // El tema, dicho sin ambigüedad
    'p[aá]gina\\s+(web|de\\s+internet)',
    'sitio\\s+web',
    'dise[ñn]o\\s+(web|de\\s+(la\\s+)?p[aá]gina)',
    'pre-?dise[ñn]o',
    '\\b(landing|dominio|hosting|tuwebgo|portafolio)\\b',
    '\\bejemplos?\\b',
    // Intención, aunque no nombre el tema
    '\\bme\\s+interesa\\b',
    '\\bcu[aá]nto\\s+(cuesta|vale|es|sale)\\b',
    '\\b(mand[aá]|env[ií]a|pas[aá])(me|nos)?\\s+(la\\s+)?(info|informaci[oó]n)\\b',
    '\\bquiero\\s+(una|mi|saber|ver)\\b',
  ].join('|'),
  'i'
)

export type EntranteParaClasificar = {
  body?: string | null
  msg_type?: string | null
}

/**
 * true = esto lo escribió una máquina saludando, no una persona.
 *
 * Se equivoca del lado de responder: ante la duda contesta. Dejar sin
 * respuesta a un dueño que sí escribió cuesta el cliente; contestarle a un
 * robot cuesta unos céntimos.
 */
export function esAutorespuesta(m: EntranteParaClasificar): boolean {
  const t = (m.body ?? '').trim()
  if (!t) return false
  if ((m.msg_type ?? 'text') !== 'text') return false

  // Si hay señal de interés, hay alguien leyendo. Se responde.
  if (INTERES_REAL.test(t)) return false

  return RECIBIMIENTO.some((re) => re.test(t))
}

/**
 * Confirmación por tiempo: un autorespondedor contesta en segundos.
 *
 * Es una señal aparte y más débil que el texto, así que solo se usa para
 * apoyar. Una persona puede contestar rápido si tenía el teléfono en la mano,
 * por eso sola no alcanza para callarse.
 */
export function llegoDemasiadoRapido(
  entranteISO: string | null | undefined,
  ultimoSalienteISO: string | null | undefined,
  segundos = 25
): boolean {
  if (!entranteISO || !ultimoSalienteISO) return false
  const dif = new Date(entranteISO).getTime() - new Date(ultimoSalienteISO).getTime()
  return dif >= 0 && dif <= segundos * 1000
}
