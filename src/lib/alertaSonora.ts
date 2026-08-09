'use client'

/**
 * El tono que suena cuando una conversación necesita a Rafael.
 *
 * Se genera con Web Audio en vez de reproducir un archivo por tres razones:
 * no hay que descargar nada (suena instantáneo, aunque la conexión esté mal),
 * no depende de un asset que se pueda romper en un deploy, y se puede hacer
 * tan insistente como haga falta sin buscar un mp3 que suene bien.
 *
 * EL OBSTÁCULO REAL ES LA POLÍTICA DE AUTOPLAY: ningún navegador deja sonar
 * audio hasta que el usuario interactúa con la página. Por eso hay un
 * `desbloquear()` que se llama desde un clic, una sola vez, y a partir de ahí
 * el contexto queda vivo y puede sonar aunque la ventana esté minimizada.
 */

let ctx: AudioContext | null = null

/** ¿Se puede sonar? Solo después de que el usuario tocó algo. */
export function estaDesbloqueado(): boolean {
  return ctx !== null && ctx.state === 'running'
}

/**
 * Crea (o reanima) el contexto de audio. TIENE que llamarse desde el
 * manejador de un evento del usuario o el navegador lo deja suspendido.
 */
export async function desbloquear(): Promise<boolean> {
  try {
    type ConAudio = typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    const Constructor = window.AudioContext ?? (globalThis as ConAudio).webkitAudioContext
    if (!Constructor) return false

    ctx ??= new Constructor()
    // Si el navegador lo dejó suspendido, este resume() dentro del gesto es
    // lo único que lo levanta.
    if (ctx.state === 'suspended') await ctx.resume()
    return ctx.state === 'running'
  } catch {
    return false
  }
}

/** Un pitido. `cuando` es un desfase en segundos desde ahora. */
function pitido(hz: number, cuando: number, dura: number, volumen: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gan = ctx.createGain()

  // Onda triangular: se oye clara y penetrante sin el chirrido áspero de la
  // cuadrada, que a los tres avisos ya molesta.
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(hz, ctx.currentTime + cuando)

  // Ataque y caída suaves: un corte seco produce un chasquido en los
  // parlantes que suena a error, no a aviso.
  const t0 = ctx.currentTime + cuando
  gan.gain.setValueAtTime(0, t0)
  gan.gain.linearRampToValueAtTime(volumen, t0 + 0.015)
  gan.gain.setValueAtTime(volumen, t0 + dura - 0.04)
  gan.gain.linearRampToValueAtTime(0, t0 + dura)

  osc.connect(gan).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + dura + 0.02)
}

/**
 * El aviso: dos notas alternadas, tres veces.
 *
 * Alternar dos tonos (como una sirena corta) se distingue del ruido de
 * notificación de cualquier otra app. Un solo pitido se confunde con
 * cualquier cosa y se ignora.
 */
export function sonarAtencion(intensidad: 1 | 2 = 1) {
  if (!ctx || ctx.state !== 'running') return
  const vol = intensidad === 2 ? 0.5 : 0.32
  const ciclos = intensidad === 2 ? 4 : 3

  for (let i = 0; i < ciclos; i++) {
    const base = i * 0.42
    pitido(988, base, 0.17, vol)         // si5
    pitido(1319, base + 0.19, 0.20, vol) // mi6
  }
}

/** Una nota corta y discreta, para mensajes que no requieren acción. */
export function sonarSuave() {
  if (!ctx || ctx.state !== 'running') return
  pitido(880, 0, 0.13, 0.18)
}
