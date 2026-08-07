import type { PostgrestError } from '@supabase/supabase-js'

type QueryResult = { error: PostgrestError | null }

/**
 * supabase-js NO lanza excepciones cuando una query falla: devuelve
 * `{ data: null, error }`. El patrón `setLeads(data || [])` que había en todo
 * el dashboard hacía que un fallo de RLS, una tabla inexistente o una columna
 * renombrada se renderizaran EXACTAMENTE igual que "no hay datos" — sin una
 * sola pista en pantalla ni en los logs.
 *
 * En Server Components: llamar a esto hace que el error suba al error boundary
 * (dashboard/error.tsx), que muestra el mensaje real de Postgres.
 * En Client Components: usar `firstError()` y pintar un banner.
 */
export function assertNoError(results: Record<string, QueryResult>): void {
  const failed = Object.entries(results)
    .filter(([, r]) => r.error)
    .map(([name, r]) => `${name} → ${r.error!.message}`)

  if (failed.length > 0) {
    throw new Error(`Supabase devolvió error en ${failed.length} query(s): ${failed.join(' | ')}`)
  }
}

/** Devuelve un mensaje legible del primer error, o null si todo salió bien. */
export function firstError(results: Record<string, QueryResult>): string | null {
  for (const [name, r] of Object.entries(results)) {
    if (r.error) return `${name}: ${r.error.message}`
  }
  return null
}

/** Zona horaria de Venezuela. Sin DST desde 2016, offset fijo UTC-4. */
export const VE_TZ = 'America/Caracas'
const VE_OFFSET = '-04:00'

/**
 * Inicio del mes actual en hora de Caracas, como ISO UTC.
 * `new Date(y, m, 1)` usaba la TZ del proceso — que en Vercel es UTC — así que
 * durante las primeras 4 horas de cada día 1 las métricas del mes atribuían mal.
 */
export function startOfMonthVE(now: Date = new Date()): string {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: VE_TZ,
    year: 'numeric',
    month: '2-digit',
  })
    .format(now)
    .split('-')

  return new Date(`${year}-${month}-01T00:00:00${VE_OFFSET}`).toISOString()
}

/** Etiqueta "Agosto 2026" calculada en hora de Caracas. */
export function monthLabelVE(now: Date = new Date()): string {
  const label = new Intl.DateTimeFormat('es-VE', {
    timeZone: VE_TZ,
    month: 'long',
    year: 'numeric',
  }).format(now)
  return label.charAt(0).toUpperCase() + label.slice(1)
}
