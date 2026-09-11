import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Firma de la conversación del asistente de la web.
 *
 * El servidor no guarda estas conversaciones: no hay tabla, y crearla pide la
 * clave de Postgres. Las guarda el navegador y las devuelve en cada mensaje.
 *
 * Sin firma eso sería un agujero. Cualquiera podría mandar un historial
 * inventado con respuestas de "Sofía" que nunca existieron —"sí, el pre-diseño
 * sale en $5"— y el modelo seguiría esa conversación como propia. Con la firma,
 * el historial que vuelve es exactamente el que salió del servidor, o se
 * descarta entero.
 *
 * Misma idea que lib/briefManual.ts, con otra llave derivada: una firma de
 * conversación no sirve como enlace del brief ni al revés.
 */

export type TurnoWeb = { rol: 'visitante' | 'sofia'; texto: string }

/** Tope de turnos que se guardan y se firman. Lo viejo se descarta. */
export const MAX_TURNOS = 30
/** Tope por turno: una respuesta de Sofía cabe holgada. */
const MAX_TEXTO = 2000

function llave(): Buffer {
  const base = process.env.BRIEF_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para firmar la conversación')
  return createHmac('sha256', base).update('asistente-web-v1').digest()
}

/** La sesión va dentro de lo firmado: una conversación no se puede pegar en otra visita. */
export function firmarConversacion(sesion: string, turnos: TurnoWeb[]): string {
  return createHmac('sha256', llave())
    .update(JSON.stringify([sesion, turnos]))
    .digest('base64url')
}

/** Valida la forma sin confiar en nada: esto llega del navegador. */
function esTurnos(v: unknown): v is TurnoWeb[] {
  return (
    Array.isArray(v) &&
    v.length <= MAX_TURNOS &&
    v.every(
      (t) =>
        t && typeof t === 'object' &&
        ((t as TurnoWeb).rol === 'visitante' || (t as TurnoWeb).rol === 'sofia') &&
        typeof (t as TurnoWeb).texto === 'string' &&
        (t as TurnoWeb).texto.length <= MAX_TEXTO
    )
  )
}

/**
 * Devuelve los turnos si la firma corresponde; null si no. Nunca lanza: una
 * firma manipulada es una conversación que empieza de cero, no un 500.
 */
export function verificarConversacion(sesion: string, turnos: unknown, firma: unknown): TurnoWeb[] | null {
  if (!esTurnos(turnos) || typeof firma !== 'string') return null
  try {
    const esperada = Buffer.from(firmarConversacion(sesion, turnos), 'utf8')
    const dada = Buffer.from(firma, 'utf8')
    // Los largos se comparan antes: timingSafeEqual explota si difieren.
    if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null
    return turnos.map((t) => ({ rol: t.rol, texto: t.texto }))
  } catch {
    return null
  }
}
