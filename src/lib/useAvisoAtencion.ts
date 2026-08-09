'use client'

import { useEffect, useRef } from 'react'
import { sonarAtencion, sonarSuave } from '@/lib/alertaSonora'

/**
 * Avisa —con sonido, notificación del escritorio y título parpadeante— cuando
 * aparece algo que necesita a Rafael.
 *
 * POR QUÉ TRES CANALES Y NO UNO. Con la ventana minimizada ninguno alcanza
 * solo:
 *   · El SONIDO se oye aunque no se vea la ventana, pero el navegador exige
 *     un gesto previo del usuario para permitirlo (ver alertaSonora).
 *   · La NOTIFICACIÓN aparece sobre cualquier cosa y sobrevive a que el
 *     navegador esté minimizado, pero el usuario puede tenerlas silenciadas
 *     en el sistema.
 *   · El TÍTULO no interrumpe nada, pero es lo que ve al volver a la
 *     pestaña sin haber oído nada.
 *
 * Solo avisa cuando el número SUBE. Sin eso sonaría en cada sondeo mientras
 * haya algo pendiente, que es la forma más rápida de que uno silencie la
 * pestaña y deje de enterarse.
 */
export function useAvisoAtencion(opts: {
  requierenHumano: number
  sinLeer: number
  activo: boolean
}) {
  const { requierenHumano, sinLeer, activo } = opts

  // El valor de la vuelta anterior. Arranca en null para no avisar en la
  // primera medición: abrir el portal y que suene una alarma por algo que ya
  // estaba ahí no es un aviso, es un susto.
  const previoHumano = useRef<number | null>(null)
  const previoSinLeer = useRef<number | null>(null)
  const tituloOriginal = useRef<string>('')

  useEffect(() => {
    if (!tituloOriginal.current) tituloOriginal.current = document.title
  }, [])

  useEffect(() => {
    const antesH = previoHumano.current
    const antesS = previoSinLeer.current
    previoHumano.current = requierenHumano
    previoSinLeer.current = sinLeer

    if (!activo || antesH === null || antesS === null) return

    const nuevosPendientes = requierenHumano > antesH
    const nuevosMensajes = sinLeer > antesS

    if (nuevosPendientes) {
      sonarAtencion(2)
      notificar(
        requierenHumano === 1 ? 'Una conversación te espera' : `${requierenHumano} conversaciones te esperan`,
        'Sofía se apartó y necesita que respondas tú.'
      )
    } else if (nuevosMensajes) {
      sonarSuave()
      notificar('Mensaje nuevo', `${sinLeer} sin leer en el inbox.`)
    }
  }, [requierenHumano, sinLeer, activo])

  /**
   * Título parpadeante mientras haya algo esperando.
   *
   * Se alterna con el original en vez de dejarlo fijo: en una barra de
   * pestañas llena, lo que llama la atención es el cambio, no el texto.
   */
  useEffect(() => {
    const base = tituloOriginal.current || 'TuWebGo — Portal'
    if (!requierenHumano) { document.title = base; return }

    let alterno = false
    const aviso = `(${requierenHumano}) TE ESPERAN`
    document.title = aviso
    const t = setInterval(() => {
      alterno = !alterno
      document.title = alterno ? base : aviso
    }, 1200)

    return () => { clearInterval(t); document.title = base }
  }, [requierenHumano])
}

/** Notificación del sistema. Al tocarla, trae la ventana al frente. */
function notificar(titulo: string, cuerpo: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const n = new Notification(titulo, {
      body: cuerpo,
      // El tag hace que una notificación reemplace a la anterior en vez de
      // apilar diez avisos del mismo asunto.
      tag: 'tuwebgo-atencion',
      // Que no se cierre sola: si estaba lejos del escritorio, tiene que
      // seguir ahí cuando vuelva.
      requireInteraction: true,
    })
    n.onclick = () => {
      window.focus()
      // Llevarlo directo a donde está el trabajo, no a donde quedó la pestaña.
      if (!location.pathname.startsWith('/dashboard/inbox')) {
        location.href = '/dashboard/inbox'
      }
      n.close()
    }
  } catch { /* sin permiso o navegador sin soporte: quedan el sonido y el título */ }
}
