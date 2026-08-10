'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { IconChat, IconCheck, IconDescarga, IconLista, IconFlecha, IconEnlaceExterno } from '@/components/icons'
import { briefAFormatoBuilder } from '@/lib/briefBuilder'

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
      ['posicion', 'Posición en precio'],
      ['tema', 'Fondo'],
      ['referencia', 'Página de referencia'],
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

/**
 * El brief como documento Markdown.
 *
 * Es el formato que se lleva a la mesa de trabajo: se abre en cualquier
 * editor, se pega en una nota, o se le da tal cual a una IA para generar el
 * pre-diseño. Usa los mismos GRUPOS que la vista, así lo que se ve es lo que
 * se descarga.
 */
function briefAMarkdown(f: BriefFila): string {
  const lineas: string[] = [
    `# Brief — ${f.negocio}`,
    '',
    `- **Recibido:** ${new Date(f.creado_at).toLocaleString('es-VE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
  ]
  if (f.contacto) lineas.push(`- **Contacto:** ${f.contacto}`)
  if (f.telefono) lineas.push(`- **WhatsApp del lead:** ${f.telefono}`)

  for (const g of GRUPOS) {
    const items = g.campos
      .map(([k, etq]) => [etq, texto(f.datos?.[k])] as const)
      .filter(([, v]) => v)
    if (!items.length) continue
    lineas.push('', `## ${g.titulo}`, '')
    for (const [etq, v] of items) {
      // Ítems de lista y no líneas sueltas: en Markdown, líneas consecutivas
      // sin separación se funden en un solo párrafo al renderizar.
      if (v.includes('\n')) {
        lineas.push(`- **${etq}:**`, ...v.split('\n').map((l) => `  ${l}`))
      } else {
        lineas.push(`- **${etq}:** ${v}`)
      }
    }
  }

  lineas.push('', '---', '', 'Generado desde el portal de TuWebGo.')
  return lineas.join('\n')
}

/** Nombre de archivo seguro: "Panadería El Trigal" → brief-panaderia-el-trigal.md */
function nombreArchivo(negocio: string): string {
  const slug = negocio
    .toLowerCase()
    // NFD separa "í" en i + tilde combinante; el rango U+0300-036F borra las
    // tildes sueltas. Escapes explícitos: un literal acá sobrevive mal a los
    // editores y al control de versiones.
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `brief-${slug || 'sin-nombre'}.md`
}

function descargarBrief(f: BriefFila) {
  const blob = new Blob([briefAMarkdown(f)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo(f.negocio)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Enlace del formulario para un cliente que no llegó por WhatsApp.
 *
 * El enlace de siempre nace de una conversación, así que un cliente de
 * Instagram, de un conocido o de una reunión se quedaba sin formulario — y el
 * formulario es obligatorio, no hay otra vía para los datos del negocio.
 *
 * El nombre es opcional pero conviene ponerlo: viaja dentro del enlace, así
 * que el brief llega ya identificado aunque el cliente escriba otra cosa.
 */
function EnlaceManual() {
  const [abierto, setAbierto] = useState(false)
  const [etiqueta, setEtiqueta] = useState('')
  const [url, setUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generar() {
    setCargando(true); setError(null); setCopiado(false)
    try {
      const res = await fetch('/api/brief/enlace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiqueta }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `Error ${res.status}`)
      setUrl(d.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar')
    } finally { setCargando(false) }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se pudo copiar. Selecciona el texto y cópialo a mano.')
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-alt)] text-[var(--text-secondary)] cursor-pointer mb-5"
      >
        <IconEnlaceExterno className="w-3.5 h-3.5" />
        Crear enlace para un cliente
      </button>
    )
  }

  return (
    <div className="border border-[var(--border)] rounded-xl p-4 mb-5 bg-[var(--bg-alt)]">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
        Enlace del formulario
      </p>
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Para un cliente que no llegó por WhatsApp. Vence en 30 días.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={etiqueta}
          onChange={(e) => { setEtiqueta(e.target.value); setUrl('') }}
          placeholder="Nombre del negocio (opcional)"
          /* 16px o iOS hace zoom solo al enfocarlo. Ver feedback_mobile_ux. */
          className="flex-1 min-w-0 text-base sm:text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]"
        />
        <button
          onClick={generar}
          disabled={cargando}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--primary)] text-white cursor-pointer disabled:opacity-60 whitespace-nowrap"
        >
          {cargando ? 'Generando…' : 'Generar'}
        </button>
      </div>

      {url && (
        <div className="mt-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 text-base sm:text-xs font-mono px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]"
            />
            <button
              onClick={copiar}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-[var(--border)] bg-[var(--card)] cursor-pointer whitespace-nowrap"
            >
              {copiado ? <><IconCheck className="w-3.5 h-3.5" />Copiado</> : 'Copiar'}
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-2">
            Cada enlace sirve para un solo cliente: el nombre va dentro. Para otro, genera uno nuevo.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

export default function BriefsClient({ initial }: { initial: BriefFila[] }) {
  const [filas, setFilas] = useState(initial)
  const [abierto, setAbierto] = useState<number | null>(initial[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<number | null>(null)

  async function copiarParaBuilder(f: BriefFila) {
    try {
      await navigator.clipboard.writeText(briefAFormatoBuilder(f.datos ?? {}, f.negocio))
      setCopiado(f.id)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      setError('No se pudo copiar. Descarga el .md y cópialo de ahí.')
    }
  }

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
      <div className="max-w-3xl">
        <h1 className="text-xl font-bold mb-1">Briefs</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Lo que los clientes responden en el formulario del pre-diseño.
        </p>
        <EnlaceManual />
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
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-1">Briefs</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-5">
        {filas.length} {filas.length === 1 ? 'recibido' : 'recibidos'}
        {sinRevisar > 0 && <> · <span className="text-amber-700 font-semibold">{sinRevisar} sin revisar</span></>}
      </p>

      <EnlaceManual />

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
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg border border-[var(--border-light)] hover:bg-[var(--card-hover)]"
                      >
                        <IconChat className="w-3.5 h-3.5" />
                        Ir a la conversación
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => descargarBrief(f)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg border border-[var(--border-light)] hover:bg-[var(--card-hover)]"
                    >
                      <IconDescarga className="w-3.5 h-3.5" />
                      Descargar .md
                    </button>
                    {/*
                      Copia y no descarga: el destino de esto es pegarlo como
                      PRIMER mensaje del constructor de landings, que con este
                      formato se salta sus 4 rondas de preguntas y arranca
                      directo en FASE 0. Un archivo habría que abrirlo para
                      copiarlo igual.
                    */}
                    <button
                      type="button"
                      onClick={() => copiarParaBuilder(f)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg border ${
                        copiado === f.id
                          ? 'border-green-300 bg-green-50 text-green-800'
                          : 'border-[var(--border-light)] hover:bg-[var(--card-hover)]'
                      }`}
                    >
                      {copiado === f.id
                        ? <><IconCheck className="w-3.5 h-3.5" />Copiado</>
                        : <><IconEnlaceExterno className="w-3.5 h-3.5" />Copiar para el constructor</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarRevisado(f)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg border ${
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
