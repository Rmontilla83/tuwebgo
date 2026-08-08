/**
 * Tasa del Banco Central de Venezuela.
 *
 * El pago móvil se hace en bolívares a la tasa BCV del día, así que sin esto
 * Sofía solo podría decir "calcúlalo tú" — que es exactamente la fricción que
 * hace que un cliente decidido no llegue a pagar.
 *
 * POR QUÉ NO SE GUARDA EN LA BASE: la tasa vale un día. Cachearla en memoria
 * del proceso alcanza, y si el proceso se recicla se vuelve a pedir. Una tabla
 * para un dato que caduca en horas es mantenimiento sin beneficio.
 */

export type TasaBcv = {
  /** Bolívares por dólar */
  bs: number
  /** Fecha en que el BCV la publicó, YYYY-MM-DD */
  fecha: string
}

const FUENTE = 'https://ve.dolarapi.com/v1/dolares/oficial'

/** Cuánto vale la respuesta antes de volver a preguntar. */
const TTL_MS = 3 * 60 * 60 * 1000

/**
 * A partir de cuántos días una tasa deja de ser usable.
 *
 * El BCV no publica sábados, domingos ni feriados: un viernes la tasa vigente
 * el domingo tiene 2 días y es CORRECTA. Cuatro días cubre un fin de semana
 * largo. Más que eso significa que la fuente se rompió, y en ese caso es mejor
 * no dar ningún número que dar uno viejo.
 */
const MAX_DIAS = 4

/**
 * Cuánto se espera a la API.
 *
 * Corto a propósito. Esto se pide dentro del webhook de WhatsApp, que responde
 * 200 a Meta DESPUÉS de que Sofía contesta. Si Meta no recibe el 200 a tiempo
 * reintenta el mensaje, y un reintento acá es un mensaje duplicado al cliente.
 * Entre esperar una tasa y contestar tarde, se contesta.
 */
const TIMEOUT_MS = 2500

let cache: { valor: TasaBcv; expira: number } | null = null
let refrescando = false

type RespuestaApi = { promedio?: number; fechaActualizacion?: string }

/**
 * Devuelve la tasa vigente, o null si nunca se pudo obtener.
 *
 * Solo la PRIMERA llamada de cada instancia espera por la red. Después siempre
 * responde al instante: si el cache venció, entrega el valor viejo y dispara la
 * actualización por detrás. Una tasa de hace tres horas es la misma del día; lo
 * que no se puede es hacer esperar al cliente.
 */
export async function obtenerTasaBcv(): Promise<TasaBcv | null> {
  if (cache) {
    if (cache.expira <= Date.now()) void refrescar()
    return cache.valor
  }
  return refrescar()
}

async function refrescar(): Promise<TasaBcv | null> {
  if (refrescando) return cache?.valor ?? null
  refrescando = true
  try {
    const res = await fetch(FUENTE, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const d = (await res.json()) as RespuestaApi
    const bs = Number(d.promedio)
    if (!Number.isFinite(bs) || bs <= 0) throw new Error('tasa inválida')

    const publicada = d.fechaActualizacion ? new Date(d.fechaActualizacion) : null
    if (!publicada || Number.isNaN(publicada.getTime())) throw new Error('fecha inválida')

    const dias = (Date.now() - publicada.getTime()) / 86_400_000
    if (dias > MAX_DIAS) throw new Error(`tasa vencida (${Math.floor(dias)} días)`)

    const valor: TasaBcv = { bs, fecha: publicada.toISOString().slice(0, 10) }
    cache = { valor, expira: Date.now() + TTL_MS }
    return valor
  } catch (e) {
    console.error('[tasaBcv]', e instanceof Error ? e.message : String(e))
    // Lo último bueno aunque haya expirado. Si nunca hubo, null — y el bloque
    // de pagos sabe qué decirle a Sofía cuando no hay tasa.
    return cache?.valor ?? null
  } finally {
    refrescando = false
  }
}

/** 37835.415 → "37.835,42" (formato venezolano) */
export function bolivares(monto: number): string {
  return monto.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** "2026-08-07" → "07/08/2026" */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
