'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { IconChat, IconCheck, IconLista, IconFlecha } from '@/components/icons'

export type BriefFila = {
  id: number
  creado_at: string
  revisado: boolean
  datos: Record<string, unknown>
  lead_id: string | null
  conversation_id: string | null
  negocio: string
  contacto: string | null
  telefono: string | null
  current_stage: string | null
}

/**
 * Orden y etiqueta de cada respuesta.
 *
 * Se define acá y no se recorre el JSON tal cual porque el orden importa: al
 * diseñar se lee primero qué es el negocio y para quién, y recién después los
 * colores. Un Object.entries() los pondría en el orden en que se guardaron.
 */
const GRUPOS: { titulo: string; campos: [string, string][] }[] = [
  {
    titulo: 'El negocio',
    campos: [
      ['nombre', 'Nombre'],
      ['que_hace', 'Qué hace'],
      ['rubro', 'Rubro'],
      ['zona', 'Zona'],
    ],
  },
  {
    titulo: 'Qué ofrece',
    campos: [
      ['servicios', 'Productos o servicios'],
      ['precios', 'Precios'],
      ['precios_detalle', 'Detalle de precios'],
    ],
  },
  {
    titulo: 'Cliente y objetivo',
    campos: [
      ['cliente', 'Le vende a'],
      ['cliente_detalle', 'Perfil'],
      ['accion', 'Qué debe hacer el visitante'],
    ],
  },
  {
    titulo: 'Ventaja',
    campos: [
      ['diferencial', 'Diferencial'],
      ['testimonios', 'Testimonios'],
      ['cifras', 'Cifras'],
    ],
  },
  {
    titulo: 'Contacto',
    campos: [
      ['whatsapp', 'WhatsApp'],
      ['instagram', 'Instagram'],
      ['email', 'Correo'],
      ['direccion', 'Dirección'],
      ['horario', 'Horario'],
    ],
  },
  {
    titulo: 'Estilo',
    campos: [
      ['estilo', 'Sensación'],
      ['colores', 'Colores'],
      ['referencia', 'Referencia'],
    ],
  },
  {
    titulo: 'Material y extras',
    campos: [
      ['material', 'Tiene'],
      ['subdominio', 'Dirección web'],
      ['notas', 'Notas'],
    ],
  },
]

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.filter(Boolean).join(' · ')
  if (v == null) return ''
  return String(v).trim()
}

function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-VE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function BriefsClient({ initial }: { initial: BriefFila[] }) {
  const [filas, setFilas] = useState(initial)
  const [abierto, setAbierto] = useState<number | null>(initial[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)

  async function alternarRevisado(f: BriefFila) {
    const nuevo = !f.revisado
    // Optimista: marcar leído tiene que sentirse instantáneo. Si falla, se
    // revierte y se dice por qué.
    setFilas((p) => p.map((x) => (x.id === f.id ? { ...x, revisado: nuevo } : x)))
    const { error: err } = await createClient()
      .from('briefs').update({ revisado: nuevo }).eq('id', f.id)
    if (err) {
      setFilas((p) => p.map((x) => (x.id === f.id ? { ...x, revisado: f.revisado } : x)))
      setError(err.message)
    }
  }

  const sinRevisar = filas.filter((f) => !f.revisado).length

  if (!filas.length) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-xl font-bold mb-1">Briefs</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Lo que los clientes responden en el formulario del pre-diseño.
        </p>
        <div className="border border-[var(--border-light)] rounded-2xl p-8 text-center">
          <IconLista className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="font-semibold mb-1">Todavía no hay ninguno</p>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            Sofía manda el enlace del formulario cuando el cliente reporta el pago.
            Cada brief queda acá, y ya no perdido entre los mensajes del chat.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <h1 className="text-xl font-bold mb-1">Briefs</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-5">
        {filas.length} {filas.length === 1 ? 'recibido' : 'recibidos'}
        {sinRevisar > 0 && <> · <span className="text-amber-700 font-semibold">{sinRevisar} sin revisar</span></>}
      </p>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</p>
      )}

      <div className="space-y-3">
        {filas.map((f) => {
          const activo = abierto === f.id
          return (
            <div
              key={f.id}
              className={`border rounded-2xl overflow-hidden transition-colors ${
                f.revisado ? 'border-[var(--border-light)]' : 'border-amber-300 bg-amber-50/40'
              }`}
            >
              <button
                type="button"
                onClick={() => setAbierto(activo ? null : f.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--card-hover)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{f.negocio}</span>
                    {!f.revisado && (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        Nuevo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                    {f.contacto ? `${f.contacto} · ` : ''}{fecha(f.creado_at)}
                  </div>
                </div>
                <IconFlecha className={`w-4 h-4 flex-shrink-0 transition-transform ${activo ? 'rotate-90' : ''}`} />
              </button>

              {activo && (
                <div className="px-4 pb-4 border-t border-[var(--border-light)] pt-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {f.conversation_id && (
                      <Link
                        href={`/dashboard/inbox?conv=${f.conversation_id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-[var(--card-hover)]"
                      >
                        <IconChat className="w-3.5 h-3.5" />
                        Ir a la conversación
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => alternarRevisado(f)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                        f.revisado
                          ? 'border-[var(--border-light)] text-[var(--text-secondary)]'
                          : 'border-green-300 bg-green-50 text-green-800'
                      }`}
                    >
                      <IconCheck className="w-3.5 h-3.5" />
                      {f.revisado ? 'Marcar sin revisar' : 'Marcar revisado'}
                    </button>
                  </div>

                  {GRUPOS.map((g) => {
                    const items = g.campos
                      .map(([k, etq]) => [etq, texto(f.datos?.[k])] as const)
                      .filter(([, v]) => v)
                    if (!items.length) return null
                    return (
                      <div key={g.titulo} className="mb-4 last:mb-0">
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
                          {g.titulo}
                        </h3>
                        <dl className="space-y-1.5">
                          {items.map(([etq, v]) => (
                            <div key={etq} className="sm:flex sm:gap-3">
                              <dt className="text-xs text-[var(--text-secondary)] sm:w-40 sm:flex-shrink-0 sm:text-right">
                                {etq}
                              </dt>
                              <dd className="text-sm whitespace-pre-wrap break-words flex-1">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
