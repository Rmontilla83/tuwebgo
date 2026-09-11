/**
 * CORS y límites para los endpoints que llama la landing (tuwebgo.net) desde
 * otro dominio: /api/contacto y /api/asistente.
 *
 * Viven acá y no en las rutas porque Next no deja exportar nada que no sea un
 * handler desde un route.ts, y dos copias de la lista de orígenes terminan
 * divergiendo.
 */

const ORIGENES = new Set(['https://tuwebgo.net', 'https://www.tuwebgo.net'])

export function origenPermitido(origin: string | null): string | null {
  if (!origin) return null
  if (ORIGENES.has(origin)) return origin
  // Para probar la landing servida en local contra `next dev`.
  if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin
  }
  return null
}

export function cabecerasCors(origin: string | null): Record<string, string> {
  const permitido = origenPermitido(origin)
  if (!permitido) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export const ipDe = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'

/**
 * Límite de pedidos por clave en una ventana, en memoria de la instancia.
 * No frena a un atacante con muchas IPs; frena al que repite en bucle.
 */
export function crearLimitador(max: number, ventanaMs: number) {
  const intentos = new Map<string, number[]>()
  return function excede(clave: string): boolean {
    const ahora = Date.now()
    const recientes = (intentos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs)
    recientes.push(ahora)
    intentos.set(clave, recientes)
    // Que el mapa no crezca sin fin en una instancia que vive días.
    if (intentos.size > 5000) intentos.clear()
    return recientes.length > max
  }
}
