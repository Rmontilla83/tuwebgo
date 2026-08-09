'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IconDinero, IconChat, IconCheck, IconCerrar } from '@/components/icons'

export type PagoPorVerificar = {
  id: number
  reportado_at: string
  mensaje: string | null
  con_comprobante: boolean
  conversation_id: string | null
  lead_id: string | null
  quien: string | null
  business_name: string | null
  current_stage: string | null
  amount_quoted: number | null
  horas: number
}

/**
 * Pagos que el cliente dice haber hecho y nadie confirmó todavía.
 *
 * Es lo primero del Dashboard porque es lo único que tiene plata parada del
 * otro lado. Y a diferencia del resto de la pantalla, NO se apaga solo:
 * quedarse ahí es exactamente su función.
 */
export default function PagosPorVerificar({ pagos }: { pagos: PagoPorVerificar[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resueltos, setResueltos] = useState<number[]>([])

  const visibles = pagos.filter((p) => !resueltos.includes(p.id))
  if (!visibles.length) return null

  async function resolver(p: PagoPorVerificar, entro: boolean) {
    setOcupado(p.id)
    setError(null)
    const supabase = createClient()

    const { error: err } = await supabase
      .from('pagos_reportados')
      .update({
        verificado_at: new Date().toISOString(),
        monto_usd: entro ? (p.amount_quoted ?? 50) : 0,
        nota: entro ? null : 'No apareció en la cuenta',
      })
      .eq('id', p.id)

    if (err) { setError(err.message); setOcupado(null); return }

    // Confirmar el pago ES el hecho que mueve el lead. Hasta ahora nadie había
    // visto el dinero, por eso seguía en "por cobrar".
    if (entro && p.lead_id && p.current_stage === 'por_cobrar') {
      const { error: leadErr } = await supabase
        .from('leads')
        .update({ current_stage: 'prediseno_curso' })
        .eq('id', p.lead_id)
      if (leadErr) console.error('[pagos] mover lead:', leadErr.message)
    }

    setResueltos((prev) => [...prev, p.id])
    setOcupado(null)
    router.refresh()
  }

  return (
    <div className="mb-6 bg-emerald-50 border border-emerald-300 rounded-2xl p-4">
      <p className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider mb-3 font-[family-name:var(--font-display)] flex items-center gap-1.5">
        <IconDinero className="w-3.5 h-3.5" />
        {visibles.length === 1 ? 'Un pago por verificar' : `${visibles.length} pagos por verificar`}
      </p>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</p>
      )}

      <div className="space-y-2.5">
        {visibles.map((p) => (
          <div key={p.id} className="bg-white border border-emerald-200 rounded-xl p-3">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {p.quien ?? 'Sin nombre'}
                  {p.business_name && (
                    <span className="font-normal text-[var(--text-secondary)]"> · {p.business_name}</span>
                  )}
                </p>
                {/* Lo que dijo el cliente, casi siempre con la referencia
                    bancaria. Si mandó una captura sola, no hay texto — y
                    decirlo es más útil que dejar el hueco en blanco. */}
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 break-words">
                  {p.mensaje?.trim()
                    ? `"${p.mensaje.trim().slice(0, 180)}"`
                    : p.con_comprobante
                      ? 'Mandó una captura, sin texto'
                      : 'Dijo que pagó, sin dar referencia'}
                  {p.mensaje?.trim() && p.con_comprobante && ' · con captura'}
                </p>
              </div>
              <span
                className={`text-[11px] font-mono flex-shrink-0 ${
                  p.horas >= 12 ? 'text-red-700 font-bold' : 'text-emerald-800'
                }`}
              >
                {p.horas < 1 ? 'recién' : p.horas < 24 ? `hace ${p.horas}h` : `hace ${Math.floor(p.horas / 24)}d`}
              </span>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {p.conversation_id && (
                <Link
                  href={`/dashboard/inbox?conv=${p.conversation_id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg border border-[var(--border-light)] hover:bg-[var(--card-hover)]"
                >
                  <IconChat className="w-3.5 h-3.5" />
                  Ver el comprobante
                </Link>
              )}
              <button
                type="button"
                disabled={ocupado === p.id}
                onClick={() => resolver(p, true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <IconCheck className="w-3.5 h-3.5" />
                {ocupado === p.id ? 'Guardando…' : 'Sí entró'}
              </button>
              <button
                type="button"
                disabled={ocupado === p.id}
                onClick={() => resolver(p, false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] disabled:opacity-50"
              >
                <IconCerrar className="w-3.5 h-3.5" />
                No aparece
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-emerald-800 mt-3">
        Esto no se borra al abrir el chat. Se apaga cuando confirmas que el dinero entró.
      </p>
    </div>
  )
}
