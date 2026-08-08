'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type AlertasInbox = {
  /** Mensajes de clientes sin leer */
  sinLeer: number
  /** Conversaciones donde Sofía se apartó y esperan a un humano */
  requierenHumano: number
}

const INTERVALO_MS = 10_000

/**
 * Cuenta lo que necesita atención, para el badge de la pestaña Inbox.
 *
 * Usa sondeo y no Realtime a propósito: esto corre en el layout, en todas las
 * pantallas, y tiene que ser confiable aunque el socket esté caído. Son dos
 * `count` con `head: true` cada 10 segundos — no traen filas, solo el número.
 *
 * Se pausa cuando la pestaña no está visible: sin eso, una pestaña olvidada
 * consume cuota toda la noche.
 */
export function useInboxAlerts(): AlertasInbox {
  const supabase = useMemo(() => createClient(), [])
  const [alertas, setAlertas] = useState<AlertasInbox>({ sinLeer: 0, requierenHumano: 0 })

  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setInterval> | null = null

    const medir = async () => {
      if (document.visibilityState !== 'visible') return

      const [sinLeer, humano] = await Promise.all([
        supabase.from('wa_conversations').select('*', { count: 'exact', head: true }).gt('unread_count', 0),
        supabase.from('wa_conversations').select('*', { count: 'exact', head: true })
          .eq('bot_activo', false).not('handoff_motivo', 'is', null),
      ])
      if (!vivo) return
      // Ante un error dejamos el último valor bueno: mejor un número viejo que
      // un cero que hace creer que no hay nada pendiente.
      if (!sinLeer.error && !humano.error) {
        setAlertas({ sinLeer: sinLeer.count ?? 0, requierenHumano: humano.count ?? 0 })
      }
    }

    const arrancar = () => {
      medir()
      timer = setInterval(medir, INTERVALO_MS)
    }
    const parar = () => { if (timer) { clearInterval(timer); timer = null } }

    const onVisibilidad = () => {
      if (document.visibilityState === 'visible') { medir(); if (!timer) arrancar() }
      else parar()
    }

    arrancar()
    document.addEventListener('visibilitychange', onVisibilidad)
    return () => { vivo = false; parar(); document.removeEventListener('visibilitychange', onVisibilidad) }
  }, [supabase])

  return alertas
}
