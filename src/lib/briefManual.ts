import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Enlaces del brief para clientes que NO vienen por Sofía.
 *
 * El enlace normal lleva un token guardado en `wa_conversations.brief_token`,
 * o sea que existe solo si hubo una conversación de WhatsApp. Un cliente que
 * llegó por Instagram, por un conocido o de una reunión no tiene ninguna, y
 * hasta ahora no había forma de mandarle el formulario.
 *
 * Este token va FIRMADO en vez de guardado. Dos razones:
 *
 *  1. No hace falta migración ni fila nueva. Nada que crear antes de tener el
 *     enlace, y nada que limpiar si el cliente nunca lo llena.
 *  2. Deja el formulario cerrado. La alternativa obvia —una URL pública sin
 *     token— reabre justo el agujero que `briefs` evitó desde el principio:
 *     sin nada que validar, un curl llena la tabla de basura.
 *
 * La llave sale de SUPABASE_SERVICE_ROLE_KEY, que ya está en Vercel y nunca
 * sale del servidor. Consecuencia a tener presente: **si esa llave se rota,
 * los enlaces manuales que estén dando vueltas dejan de servir.** Con 30 días
 * de vida es un costo chico, y se arregla generando el enlace otra vez.
 */

const PREFIJO = 'm.'
const DIAS_POR_DEFECTO = 30

/** La llave se deriva, no se usa cruda: así no firma nada más que esto. */
function llave(): Buffer {
  const base = process.env.BRIEF_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para firmar el enlace')
  return createHmac('sha256', base).update('brief-manual-v1').digest()
}

const aB64 = (b: Buffer) => b.toString('base64url')

function firma(payload: string): string {
  return aB64(createHmac('sha256', llave()).update(payload).digest())
}

export type TokenManual = {
  /** Cómo llamarle a este cliente en la lista de briefs. Puede ir vacío. */
  etiqueta: string
}

/** Crea el token. La etiqueta se recorta: viaja en la URL. */
export function firmarTokenManual(etiqueta = '', dias = DIAS_POR_DEFECTO): string {
  const cuerpo = {
    e: Math.floor(Date.now() / 1000) + dias * 86400,
    l: etiqueta.trim().slice(0, 80),
  }
  const payload = aB64(Buffer.from(JSON.stringify(cuerpo), 'utf8'))
  return `${PREFIJO}${payload}.${firma(payload)}`
}

export const esTokenManual = (token: string) => token.startsWith(PREFIJO)

/**
 * Devuelve la etiqueta si el token es legítimo y no venció; null si no.
 *
 * Nunca lanza: un token manipulado es una respuesta 404 normal, no un 500.
 */
export function verificarTokenManual(token: string): TokenManual | null {
  if (!esTokenManual(token)) return null

  const partes = token.slice(PREFIJO.length).split('.')
  if (partes.length !== 2) return null
  const [payload, recibida] = partes

  try {
    const esperada = Buffer.from(firma(payload), 'utf8')
    const dada = Buffer.from(recibida, 'utf8')
    // Los largos se comparan antes: timingSafeEqual explota si difieren.
    if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null

    const cuerpo = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof cuerpo?.e !== 'number' || cuerpo.e < Math.floor(Date.now() / 1000)) return null

    return { etiqueta: typeof cuerpo.l === 'string' ? cuerpo.l : '' }
  } catch {
    return null
  }
}
