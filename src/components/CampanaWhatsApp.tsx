'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PLANTILLAS, previsualizar, COSTO_APROX } from '@/lib/waTemplates'
import { IconAlerta, IconCheck, IconAsistente, IconUsuario } from '@/components/icons'

const LIMITE_META = 250

type Etapa = { slug: string; label: string; sort_order: number }
type Progreso = {
  campaign_id: string; name: string; plantilla: string | null; status: string
  platform: string
  total: number; pendientes: number; enviados: number; entregados: number
  leidos: number; respondieron: number; fallidos: number
}

/**
 * Campañas de WhatsApp sobre los contactos de la base.
 *
 * El eje del diseño es el límite de Meta: sin verificación de negocio se pueden
 * iniciar 250 conversaciones nuevas cada 24 horas. Con 613 contactos eso son
 * tres días. La UI no lo esconde ni lo descubre a mitad del envío — lo muestra
 * antes de empezar y va marcando cuánto queda del cupo.
 */
export default function CampanaWhatsApp() {
  const supabase = useMemo(() => createClient(), [])

  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [conteos, setConteos] = useState<Record<string, number>>({})
  const [campanas, setCampanas] = useState<Progreso[]>([])
  const [iniciadasHoy, setIniciadasHoy] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formulario
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [plantilla, setPlantilla] = useState(PLANTILLAS[0]?.name ?? '')
  const [etapasSel, setEtapasSel] = useState<string[]>(['sin_contactar'])
  const [tope, setTope] = useState(200)
  const [guardando, setGuardando] = useState(false)

  // Envío
  const [enviando, setEnviando] = useState<string | null>(null)
  const [avance, setAvance] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [et, ld, cp, ini] = await Promise.all([
      supabase.from('pipeline_stages').select('slug, label, sort_order').eq('is_lost', false).order('sort_order'),
      supabase.from('leads').select('current_stage').eq('es_prueba', false).not('phone_e164', 'is', null),
      supabase.from('v_campana_progreso').select('*'),
      supabase.rpc('wa_iniciadas_hoy'),
    ])
    if (et.error || ld.error || cp.error) {
      setError(et.error?.message ?? ld.error?.message ?? cp.error?.message ?? null)
    }
    setEtapas(et.data ?? [])
    const c: Record<string, number> = {}
    for (const l of ld.data ?? []) c[l.current_stage] = (c[l.current_stage] ?? 0) + 1
    setConteos(c)
    setCampanas((cp.data as Progreso[]) ?? [])
    setIniciadasHoy(Number(ini.data ?? 0))
    setCargando(false)
  }, [supabase])

  useEffect(() => {
    let vivo = true
    void (async () => { await cargar(); if (!vivo) return })()
    return () => { vivo = false }
  }, [cargar])

  const alcance = etapasSel.reduce((s, e) => s + (conteos[e] ?? 0), 0)
  const plantillaSel = PLANTILLAS.find((p) => p.name === plantilla)
  const cupoRestante = Math.max(0, Math.min(tope, LIMITE_META) - iniciadasHoy)
  const dias = cupoRestante > 0 ? Math.ceil(alcance / Math.min(tope, LIMITE_META)) : 0
  const costoAprox = plantillaSel
    ? (alcance * parseFloat(COSTO_APROX[plantillaSel.category].replace('$', '').replace(',', '.'))).toFixed(2)
    : '0'

  async function crear() {
    if (!nombre.trim() || !alcance) return
    setGuardando(true); setError(null)
    try {
      const { data: camp, error: e1 } = await supabase.from('campaigns').insert({
        name: nombre.trim(), platform: 'whatsapp', plantilla,
        start_date: new Date().toISOString().split('T')[0],
        status: 'active', enviados_por_dia: tope,
        segmento: { etapas: etapasSel },
      }).select('id').single()

      if (e1 || !camp) { setError(e1?.message ?? 'No se pudo crear'); return }

      const { data: enc, error: e2 } = await supabase.rpc('campana_encolar', {
        p_campaign_id: camp.id, p_etapas: etapasSel, p_canales: null, p_limite: null,
      })
      if (e2) { setError(e2.message); return }

      const r = Array.isArray(enc) ? enc[0] : enc
      setAvance(`Campaña creada con ${r?.encolados ?? 0} contactos en cola.`)
      setCreando(false); setNombre('')
      await cargar()
    } finally { setGuardando(false) }
  }

  /** Manda tandas hasta agotar la cola o el cupo del día. */
  async function lanzar(id: string) {
    setEnviando(id); setError(null); setAvance('Enviando…')
    let total = 0, fallos = 0
    try {
      for (;;) {
        const res = await fetch('/api/wa/campana', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: id, tanda: 20 }),
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error ?? `Error ${res.status}`); break }

        total += d.enviados ?? 0
        fallos += d.fallidos ?? 0
        setAvance(`${total} enviados${fallos ? `, ${fallos} fallidos` : ''}${d.restantes ? ` · ${d.restantes} en cola` : ''}`)

        if (d.cupoAgotado) { setAvance(`${total} enviados. ${d.mensaje}`); break }
        if (d.terminada || d.enviados === 0) { setAvance(`Listo: ${total} enviados${fallos ? `, ${fallos} fallidos` : ''}.`); break }
      }
      await cargar()
    } catch {
      setError('Se cortó la conexión. Los enviados quedaron registrados; podés retomar.')
    } finally { setEnviando(null) }
  }

  if (cargando) {
    return <div className="bg-[var(--card)] rounded-2xl p-8 border border-[var(--border)] text-center">
      <p className="text-sm text-[var(--text-muted)]">Cargando…</p>
    </div>
  }

  return (
    <div className="space-y-4">
      {/* ── Cupo del día ── */}
      <div className={`rounded-2xl p-4 border ${
        cupoRestante === 0 ? 'bg-red-50 border-red-200' : 'bg-[var(--card)] border-[var(--border)]'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-[family-name:var(--font-display)]">
              Cupo de Meta · últimas 24 h
            </p>
            <p className="text-2xl font-bold text-[var(--dark)] font-[family-name:var(--font-display)] mt-1">
              {iniciadasHoy} <span className="text-base font-medium text-[var(--text-muted)]">de {LIMITE_META}</span>
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {cupoRestante > 0
                ? `Podés iniciar ${cupoRestante} conversaciones más hoy.`
                : 'Cupo agotado. Se libera a medida que pasan las 24 h de cada envío.'}
            </p>
          </div>
          <div className="w-14 h-14 flex-shrink-0 relative">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                stroke={cupoRestante === 0 ? '#DC2626' : 'var(--primary)'}
                strokeDasharray={`${Math.min(100, (iniciadasHoy / LIMITE_META) * 100)} 100`} />
            </svg>
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-2.5 pt-2.5 border-t border-[var(--border-light)]">
          Sin verificación de negocio, Meta permite iniciar 250 conversaciones nuevas cada 24 horas.
          Verificar el negocio sube ese límite.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 break-words">{error}</p>
        </div>
      )}
      {avance && !error && (
        <div className="px-4 py-3 rounded-xl bg-[var(--primary-glow)] border border-[var(--primary)]/20">
          <p className="text-xs text-[var(--primary)] font-medium">{avance}</p>
        </div>
      )}

      {/* ── Campañas activas ── */}
      {campanas.filter(c => c.plantilla).map((c) => {
        const pct = c.total > 0 ? Math.round((c.enviados / c.total) * 100) : 0
        return (
          <div key={c.campaign_id} className="bg-[var(--card)] rounded-2xl p-4 border border-[var(--border)] shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="font-bold text-[var(--dark)] text-sm truncate">{c.name}</h3>
                <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">{c.plantilla}</p>
              </div>
              {c.pendientes > 0 && (
                <button
                  onClick={() => lanzar(c.campaign_id)}
                  disabled={enviando !== null || cupoRestante === 0}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 transition-all"
                >
                  {enviando === c.campaign_id ? 'Enviando…' : `Enviar ${Math.min(c.pendientes, cupoRestante)}`}
                </button>
              )}
            </div>

            <div className="h-2 rounded-full bg-[var(--bg-alt)] overflow-hidden mb-2">
              <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="text-[var(--text-secondary)]">{c.enviados}/{c.total} enviados</span>
              {c.respondieron > 0 && (
                <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                  <IconCheck className="w-3 h-3" />{c.respondieron} respondieron
                </span>
              )}
              {c.fallidos > 0 && (
                <span className="text-red-600 inline-flex items-center gap-1">
                  <IconAlerta className="w-3 h-3" />{c.fallidos} fallidos
                </span>
              )}
              {c.pendientes > 0 && <span className="text-[var(--text-muted)]">{c.pendientes} en cola</span>}
            </div>
          </div>
        )
      })}

      {/* ── Nueva campaña ── */}
      {!creando ? (
        <button
          onClick={() => setCreando(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-[var(--border)] text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all cursor-pointer"
        >
          + Nueva campaña de WhatsApp
        </button>
      ) : (
        <div className="bg-[var(--card)] rounded-2xl p-5 border border-[var(--primary)]/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[var(--dark)] text-sm font-[family-name:var(--font-display)]">Nueva campaña</h3>
            <button onClick={() => setCreando(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--dark)] cursor-pointer">Cancelar</button>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Reactivación Anzoátegui — agosto"
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)]" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">A quién</label>
            <div className="flex flex-wrap gap-1.5">
              {etapas.map((e) => {
                const sel = etapasSel.includes(e.slug)
                const n = conteos[e.slug] ?? 0
                return (
                  <button key={e.slug}
                    onClick={() => setEtapasSel((p) => sel ? p.filter(x => x !== e.slug) : [...p, e.slug])}
                    disabled={n === 0}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      sel ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'bg-[var(--bg-alt)] text-[var(--text-secondary)] border-[var(--border)]'
                    }`}>
                    {e.label} <span className="opacity-70">{n}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">Solo cuenta contactos con móvil válido.</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Plantilla</label>
            <select value={plantilla} onChange={(e) => setPlantilla(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] cursor-pointer">
              {PLANTILLAS.map((p) => <option key={p.name} value={p.name}>{p.proposito}</option>)}
            </select>
            {plantillaSel && (
              <div className="mt-2 bg-emerald-500 text-white rounded-xl rounded-bl-md px-3 py-2 max-w-[90%]">
                <p className="text-sm whitespace-pre-wrap">{previsualizar(plantillaSel)}</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Máximo por día — {tope}
            </label>
            <input type="range" min={20} max={LIMITE_META} step={10} value={tope}
              onChange={(e) => setTope(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
          </div>

          {/* Resumen antes de crear */}
          <div className="p-3 rounded-xl bg-[var(--bg-alt)] border border-[var(--border-light)] space-y-1">
            <p className="text-sm font-semibold text-[var(--dark)] inline-flex items-center gap-1.5">
              <IconUsuario className="w-4 h-4" />{alcance} contactos
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              {dias > 1
                ? `Se van a mandar en ${dias} días por el límite de Meta.`
                : alcance > 0 ? 'Entran todos hoy.' : 'Elegí al menos una etapa con contactos.'}
            </p>
            {plantillaSel && alcance > 0 && (
              <p className="text-xs text-[var(--text-secondary)]">
                Costo estimado: <span className="font-semibold">${costoAprox}</span>{' '}
                <span className="text-[var(--text-muted)]">({plantillaSel.category})</span>
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <IconAsistente className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900">
              La plantilla tiene que estar <strong>aprobada</strong> por Meta o los envíos fallan.
              Cuando alguien responda, Sofía sigue la conversación sola desde el Inbox.
            </p>
          </div>

          <button onClick={crear} disabled={guardando || !nombre.trim() || !alcance}
            className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-[0.98]">
            {guardando ? 'Creando…' : `Crear campaña para ${alcance} contactos`}
          </button>
        </div>
      )}
    </div>
  )
}
