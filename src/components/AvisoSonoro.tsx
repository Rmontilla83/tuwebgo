'use client'

import { useEffect, useState } from 'react'
import { desbloquear, sonarAtencion } from '@/lib/alertaSonora'
import { IconAlerta, IconCheck } from '@/components/icons'

const CLAVE = 'tuwebgo:aviso-sonoro'

/**
 * Interruptor del aviso sonoro.
 *
 * TIENE que existir como botón: los navegadores no dejan sonar audio ni pedir
 * permiso de notificaciones sin un gesto del usuario. No es una preferencia
 * que se pueda activar sola por más que uno quiera.
 *
 * Al encenderlo suena una vez a propósito. Así se sabe en el momento si el
 * volumen del equipo está en cero, en vez de descubrirlo dos horas después
 * cuando un cliente lleva rato esperando.
 */
export default function AvisoSonoro({ onCambio }: { onCambio: (activo: boolean) => void }) {
  const [activo, setActivo] = useState(false)
  const [permiso, setPermiso] = useState<NotificationPermission | 'no-soportado'>('default')

  // La preferencia se recuerda, pero el audio NO queda desbloqueado entre
  // recargas: cada carga necesita su propio gesto. Por eso el botón vuelve a
  // aparecer apagado y con la marca de "recordado".
  const [recordado, setRecordado] = useState(false)
  useEffect(() => {
    try { setRecordado(localStorage.getItem(CLAVE) === '1') } catch { /* modo privado */ }
    setPermiso(typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission)
  }, [])

  async function encender() {
    const ok = await desbloquear()
    if (!ok) return

    // El permiso de notificaciones se pide DENTRO del mismo gesto: fuera de
    // él, Chrome lo descarta sin preguntar.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { setPermiso(await Notification.requestPermission()) } catch { /* ignorado */ }
    }

    setActivo(true)
    onCambio(true)
    try { localStorage.setItem(CLAVE, '1') } catch { /* modo privado */ }
    sonarAtencion(1)   // prueba inmediata: si no se oye, el problema es el equipo
  }

  function apagar() {
    setActivo(false)
    onCambio(false)
    try { localStorage.removeItem(CLAVE) } catch { /* modo privado */ }
  }

  if (activo) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={apagar}
          title={
            permiso === 'granted'
              ? 'Suena y avisa en el escritorio aunque el portal esté minimizado. Toca para silenciar.'
              : 'Suena aunque el portal esté minimizado. Sin permiso de notificaciones, solo sonido.'
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 cursor-pointer"
        >
          <IconCheck className="w-3.5 h-3.5" />
          Aviso activo
        </button>
        {permiso === 'denied' && (
          <span
            title="Bloqueaste las notificaciones para este sitio. Vas a oír el tono, pero no verás el aviso del escritorio. Se cambia en el candado de la barra de direcciones."
            className="text-[10px] text-amber-700 cursor-help"
          >
            solo sonido
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={encender}
      title="Activa el tono y el aviso del escritorio. El navegador exige un clic para permitirlo, por eso hay que encenderlo en cada sesión."
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
        recordado
          ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
          : 'bg-[var(--bg-alt)] text-[var(--text-secondary)] border-[var(--border)]'
      }`}
    >
      <IconAlerta className="w-3.5 h-3.5" />
      {recordado ? 'Activar el aviso' : 'Activar aviso sonoro'}
    </button>
  )
}
