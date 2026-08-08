'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NOMBRE_BOT } from '@/lib/gemini'
import { IconAsistente, IconUsuario } from '@/components/icons'

/** Interruptor general del asistente. Apagarlo lo calla en TODAS las conversaciones. */
export default function ControlBot() {
  const supabase = useMemo(() => createClient(), [])
  const [activo, setActivo] = useState<boolean | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('app_settings').select('valor').eq('clave', 'bot_habilitado').single()
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setActivo(false); return }
        setActivo(data?.valor === true)
      })
  }, [supabase])

  async function alternar() {
    if (activo === null || guardando) return
    const nuevo = !activo
    setGuardando(true); setError(null); setActivo(nuevo)

    const { error: err } = await supabase
      .from('app_settings')
      .update({ valor: nuevo, actualizado: new Date().toISOString() })
      .eq('clave', 'bot_habilitado')

    if (err) { setError(err.message); setActivo(!nuevo) }
    setGuardando(false)
  }

  return (
    <div className="bg-[var(--card)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 rounded-full gradient-bar" />
            <h2 className="text-sm font-bold text-[var(--dark)] font-[family-name:var(--font-display)] uppercase tracking-wider">
              Asistente {NOMBRE_BOT}
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {activo === null ? 'Cargando…'
              : activo
                ? `${NOMBRE_BOT} está atendiendo las conversaciones nuevas. Se aparta sola cuando el cliente quiere comprar, se queja o pide hablar con alguien.`
                : `${NOMBRE_BOT} está apagada. Todos los mensajes te esperan a ti en el Inbox.`}
          </p>
          {error && <p className="text-xs text-red-600 mt-2 break-words">{error}</p>}
        </div>

        <button
          onClick={alternar}
          disabled={activo === null || guardando}
          role="switch"
          aria-checked={!!activo}
          aria-label={`Asistente ${NOMBRE_BOT}`}
          className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
            activo ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
          }`}
        >
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            activo ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {activo && (
        <p className="text-[11px] text-[var(--text-muted)] mt-3 pt-3 border-t border-[var(--border-light)]">
          Si respondes a mano en una conversación, {NOMBRE_BOT} se calla ahí sola. Para que retome,
          usa el botón <span className="font-semibold inline-flex items-center gap-1"><IconUsuario className="w-3 h-3" />Tú / <IconAsistente className="w-3 h-3" />{NOMBRE_BOT}</span> en el Inbox.
        </p>
      )}
    </div>
  )
}
