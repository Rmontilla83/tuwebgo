'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type AlertasInbox = {
  /** Mensajes de clientes sin leer */
  sinLeer: number
  /** Conversaciones donde Sofía se apartó y esperan a un humano */
  requierenHumano: number
}

const INTERVALO_VISIBLE_MS = 10_000
/**
 * Con la pestaña oculta se sigue midiendo, más espaciado.
 *
 * Antes esto se detenía por completo para no gastar cuota de noche. Pero el
 * aviso sonoro tiene que llegar JUSTO cuando el portal no se está mirando —
 * si no, no hace falta un aviso. Treinta segundos es el compromiso: los
 * navegadores frenan los temporizadores de las pestañas de fondo a uno por
 * minuto de todas formas, así que pedir menos no acelera nada y pedir más
 * agregaría demora sobre la que ya impone el navegador.
 */
const INTERVALO_OCULTO_MS = 30_000

/**
 * Cuenta lo que necesita atención, para el badge y para el aviso sonoro.
 *
 * Usa sondeo y no Realtime a propósito: esto corre en el layout, en todas las
 * pantallas, y tiene que ser confiable aunque el socket esté caído. Son dos
 * `count` con `head: true` — no traen filas, solo el número.
 */
export function useInboxAlerts(): AlertasInbox {
  const supabase = useMemo(() => createClient(), [])
  const [alertas, setAlertas] = useState<AlertasInbox>({ sinLeer: 0, requierenHumano: 0 })

  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setInterval> | null = null

    const medir = async () => {
      const [sinLeer, humano] = await Promise.all([
        supabase.from('wa_conversations').select('*', { count: 'exact', head: true }).gt('unread_count', 0),
        // Solo cuenta si además hay algo SIN LEER. Un traspaso ya atendido no
        // es pendiente: el trigger marca handoff_motivo también cuando Rafael
        // responde a mano, así que sin este filtro el badge se quedaba en ámbar
        // para siempre sobre conversaciones ya resueltas.
        supabase.from('wa_conversations').select('*', { count: 'exact', head: true })
          .eq('bot_activo', false).not('handoff_motivo', 'is', null).gt('unread_count', 0),
      ])
      if (!vivo) return
      // Ante un error dejamos el último valor bueno: mejor un número viejo que
      // un cero que hace creer que no hay nada pendiente.
      if (!sinLeer.error && !humano.error) {
        setAlertas({ sinLeer: sinLeer.count ?? 0, requierenHumano: humano.count ?? 0 })
      }
    }

    const parar = () => { if (timer) { clearInterval(timer); timer = null } }

    const arrancar = () => {
      parar()
      const ms = document.visibilityState === 'visible' ? INTERVALO_VISIBLE_MS : INTERVALO_OCULTO_MS
      timer = setInterval(medir, ms)
    }

    // Al cambiar de visibilidad se remide de inmediato y se reajusta el ritmo:
    // volver a la pestaña tiene que mostrar el número real al instante, no el
    // de hace medio minuto.
    const onVisibilidad = () => { medir(); arrancar() }

    medir()
    arrancar()
    document.addEventListener('visibilitychange', onVisibilidad)
    return () => { vivo = false; parar(); document.removeEventListener('visibilitychange', onVisibilidad) }
  }, [supabase])

  return alertas
}
