/**
 * Con qué se rellenan las variables de una plantilla de WhatsApp.
 *
 * Vive acá y no en la ruta de campañas porque hay DOS caminos que mandan
 * plantillas: el envío masivo y el botón del inbox. Estaban resueltos por
 * separado y el del inbox se quedó atrás con dos fallas que ya se habían
 * arreglado del otro lado:
 *
 *  · El saludo caía en `'Hola'` cuando el lead no tenía nombre de persona, y
 *    salía **"Hola Hola, te escribimos de TuWebGo"**. Los 173 contactos
 *    scrapeados no traen nombre: Google Maps da el del negocio y nada más.
 *  · Todo lo que no fuera {{1}} recibía el nombre del negocio. Servía con
 *    plantillas de dos variables, pero `presentacion_tuwebgo` tiene tres y el
 *    {{3}} habría repetido el negocio dentro de su propio paréntesis:
 *    "Encontramos El Trigal en Google (El Trigal)".
 *
 * Una lógica duplicada se arregla una vez y se rompe en el otro lado. Ahora
 * es una sola.
 */

export type LeadParaPlantilla = {
  name?: string | null
  business_name?: string | null
  ciudad?: string | null
  notes?: string | null
}

/**
 * El {{1}}. Cuando no hay persona, "qué tal" completa la frase con
 * naturalidad y la personalización real queda en {{2}}.
 */
export function saludoDe(lead: LeadParaPlantilla | null | undefined): string {
  const pila = (lead?.name ?? '').trim()
  if (!pila) return 'qué tal'

  const primero = pila.split(/\s+/)[0]
  // Un "nombre" que en realidad es el negocio (viene así de algunas
  // importaciones) tampoco sirve como saludo personal.
  if (primero.length < 2 || primero.length > 20) return 'qué tal'
  return primero
}

/**
 * El {{3}}: la prueba de que miramos su negocio y no una lista.
 *
 * En un WhatsApp en frío la primera pregunta del cliente es "¿de dónde
 * sacaste mi número?". Si no la respondemos, se la responde él solo y la
 * respuesta que se inventa siempre es peor.
 *
 * Las reseñas van primero porque son el dato más fuerte y el más halagador,
 * pero solo a partir de 20: probando contra los 173 contactos reales salieron
 * "(0 reseñas en Google)" a 23 negocios y "(3 reseñas y 5 estrellas)". Los dos
 * abren señalando algo flojo de su negocio, y el silencio siempre es mejor
 * que un elogio que no lo es.
 *
 * Va entre paréntesis en la plantilla a propósito: así funciona como etiqueta
 * y ninguna variante necesita artículo.
 */
export function senalDe(lead: LeadParaPlantilla | null | undefined): string {
  const notas = lead?.notes ?? ''

  const resenas = Number(notas.match(/(\d+)\s+rese[ñn]as/i)?.[1] ?? 0)
  if (resenas >= 20) {
    // La calificación viene con punto de la fuente en inglés. Acá se escribe
    // 4,7 — un "4.7" en un mensaje en español delata que lo armó una máquina.
    const nota = notas.match(/calificaci[oó]n\s+([\d.,]+)/i)?.[1]?.replace('.', ',')
    return nota ? `${resenas} reseñas y ${nota} estrellas` : `${resenas} reseñas en Google`
  }

  const rubro = notas.match(/Rubro original:\s*([^·\n]+)/i)?.[1]?.trim()
  const ciudad = lead?.ciudad?.trim()
  if (rubro && ciudad) return `${rubro} en ${ciudad}`
  if (rubro) return rubro
  if (ciudad) return `negocio en ${ciudad}`

  // Último recurso. Sigue siendo cierto: de ahí salió el número.
  return 'tu ficha de Google'
}

/**
 * Los valores en orden, tantos como variables tenga la plantilla.
 *
 * Si alguna vez aparece una de cuatro variables, la última se repite en vez
 * de dejar un hueco: Meta rechaza el envío entero si falta un parámetro.
 */
export function paramsDePlantilla(
  ejemplos: readonly string[],
  lead: LeadParaPlantilla | null | undefined
): string[] {
  const valores = [
    saludoDe(lead),
    lead?.business_name?.trim() || 'tu negocio',
    senalDe(lead),
  ]
  return ejemplos.map((_, i) => valores[i] ?? valores[valores.length - 1])
}
