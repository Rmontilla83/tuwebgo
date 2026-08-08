'use client'

import { useState } from 'react'
import { PLANTILLAS, previsualizar, COSTO_APROX } from '@/lib/waTemplates'
import { IconCheck, IconVolver, IconError } from '@/components/icons'

type EstadoMeta = { name: string; status: string; category?: string; rejected_reason?: string }
type Resultado = { name: string; estado: string; detalle?: string }

const COLOR_ESTADO: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  PAUSED: 'bg-orange-50 text-orange-700 border-orange-200',
}

const TEXTO_ESTADO: Record<string, string> = {
  APPROVED: 'Aprobada',
  PENDING: 'En revisión',
  REJECTED: 'Rechazada',
  PAUSED: 'Pausada',
}

export default function PlantillasWA() {
  const [estados, setEstados] = useState<EstadoMeta[] | null>(null)
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [ninguna, setNinguna] = useState(false)

  async function consultar() {
    setCargando(true); setError(null)
    try {
      const res = await fetch('/api/wa/templates')
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? `Error ${res.status}`); return }
      setEstados(d.plantillas ?? [])
      setNinguna(!!d.ningunaRegistrada)
    } catch { setError('No se pudo conectar con Meta.') } finally { setCargando(false) }
  }

  async function subir() {
    setSubiendo(true); setError(null); setResultados(null)
    try {
      const res = await fetch('/api/wa/templates', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? `Error ${res.status}`); return }
      setResultados(d.resultados ?? [])
      await consultar()
    } catch { setError('No se pudo conectar con Meta.') } finally { setSubiendo(false) }
  }

  const estadoDe = (name: string) => estados?.find((e) => e.name === name)

  return (
    <div className="bg-[var(--card)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-5 rounded-full gradient-bar" />
        <h2 className="text-sm font-bold text-[var(--dark)] font-[family-name:var(--font-display)] uppercase tracking-wider">
          Plantillas de WhatsApp
        </h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-4 mt-2">
        Solo hacen falta para escribirle a alguien <strong>fuera</strong> de la ventana de 24 horas.
        Dentro de la ventana Sofía responde libre y no cuesta nada. Meta las revisa en minutos u horas.
      </p>

      {error && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 break-words">{error}</p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={subir}
          disabled={subiendo}
          className="px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] disabled:opacity-50 disabled:cursor-wait cursor-pointer transition-all"
        >
          {subiendo ? 'Subiendo…' : `Subir las ${PLANTILLAS.length} a Meta`}
        </button>
        <button
          onClick={consultar}
          disabled={cargando}
          className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-alt)] disabled:opacity-50 cursor-pointer transition-all"
        >
          {cargando ? 'Consultando…' : 'Ver estado'}
        </button>
      </div>

      {ninguna && (
        <div className="mb-4 px-3 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm font-semibold text-red-800">Meta no tiene ninguna plantilla registrada</p>
          <p className="text-xs text-red-700 mt-1">
            No están &quot;en revisión&quot;: nunca llegaron. Dale a <strong>Subir las {PLANTILLAS.length} a Meta</strong> y
            mirá el resultado de cada una — ahí sale el motivo si alguna es rechazada.
          </p>
        </div>
      )}

      {estados && !ninguna && estados.every(e => e.status === 'PENDING') && (
        <div className="mb-4 px-3 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-sm font-semibold text-amber-900">Todas siguen en revisión</p>
          <p className="text-xs text-amber-800 mt-1">
            Meta suele aprobar en minutos, pero con una cuenta nueva y sin verificación de negocio
            puede tardar hasta 24 h — y las de categoría MARKETING siempre tardan más que las UTILITY.
            Si pasan 48 h, verificá el negocio en Business Manager: es lo que más acelera la revisión.
          </p>
        </div>
      )}

      {resultados && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-[var(--bg-alt)] border border-[var(--border-light)]">
          {resultados.map((r) => (
            <p key={r.name} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
              {r.estado === 'enviada' ? <IconCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                : r.estado === 'ya_existia' ? <IconVolver className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                : <IconError className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
              <span><span className="font-mono">{r.name}</span>{' — '}
              {r.estado === 'enviada' ? 'enviada a revisión' : r.estado === 'ya_existia' ? 'ya existía' : r.detalle}</span>
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {PLANTILLAS.map((p) => {
          const est = estadoDe(p.name)
          const abierto = abierta === p.name
          return (
            <div key={p.name} className="border border-[var(--border-light)] rounded-xl overflow-hidden">
              <button
                onClick={() => setAbierta(abierto ? null : p.name)}
                className="w-full text-left px-3.5 py-3 hover:bg-[var(--bg-alt)] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--dark)] font-mono truncate">{p.name}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{p.proposito}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold ${
                      p.category === 'MARKETING'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-[var(--bg-alt)] text-[var(--text-secondary)] border-[var(--border)]'
                    }`}>
                      {p.category} {COSTO_APROX[p.category]}
                    </span>
                    {est && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold ${COLOR_ESTADO[est.status] ?? 'bg-[var(--bg-alt)] text-[var(--text-muted)] border-[var(--border)]'}`}>
                        {TEXTO_ESTADO[est.status] ?? est.status}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {abierto && (
                <div className="px-3.5 pb-3.5 pt-1 bg-[var(--bg-alt)]">
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    Cómo lo ve el cliente
                  </p>
                  <div className="bg-emerald-500 text-white rounded-xl rounded-bl-md px-3 py-2 max-w-[85%]">
                    <p className="text-sm whitespace-pre-wrap">{previsualizar(p)}</p>
                    {p.footer && <p className="text-[10px] text-white/60 mt-1.5">{p.footer}</p>}
                  </div>
                  {est?.rejected_reason && (
                    <p className="text-xs text-red-600 mt-2">Motivo del rechazo: {est.rejected_reason}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] mt-4">
        Meta puede recategorizar una plantilla de UTILITY a MARKETING por su contenido y multiplicar
        el costo por 6,5. El CRM está suscrito a esos avisos y guarda el costo real de cada mensaje.
      </p>
    </div>
  )
}
