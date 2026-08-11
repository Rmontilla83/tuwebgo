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
  /** Tope diario de cada campaña. `v_campana_progreso` no lo trae. */
  const [topes, setTopes] = useState<Record<string, number>>({})
  const [salud, setSalud] = useState<{ calidad: string; limite?: string; tasaFallo: number; seguroEnviar: boolean; aviso: string | null } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formulario
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [plantilla, setPlantilla] = useState(PLANTILLAS[0]?.name ?? '')
  const [etapasSel, setEtapasSel] = useState<string[]>(['sin_contactar'])
  const [tope, setTope] = useState(200)
  // Segmento: por rubro o por estado. Vacío = todos los de la etapa.
  const [segTipo, setSegTipo] = useState<'rubro' | 'estado'>('rubro')
  const [segSel, setSegSel] = useState<string[]>([])
  const [segmentos, setSegmentos] = useState<{ tipo: string; valor: string; contactos: number }[]>([])
  // Cuántos contactos entran a ESTA campaña. 0 = todos los del segmento.
  const [cuantos, setCuantos] = useState(20)
  const [guardando, setGuardando] = useState(false)

  // Envío
  const [enviando, setEnviando] = useState<string | null>(null)
  const [avance, setAvance] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [et, ld, cp, ini, seg, tps] = await Promise.all([
      supabase.from('pipeline_stages').select('slug, label, sort_order').eq('is_lost', false).order('sort_order'),
      supabase.from('leads').select('current_stage').eq('es_prueba', false).not('phone_e164', 'is', null),
      supabase.from('v_campana_progreso').select('*'),
      supabase.rpc('wa_iniciadas_hoy'),
      supabase.rpc('segmentos_disponibles'),
      supabase.from('campaigns').select('id, enviados_por_dia'),
    ])
    if (et.error || ld.error || cp.error) {
      setError(et.error?.message ?? ld.error?.message ?? cp.error?.message ?? null)
    }
    setEtapas(et.data ?? [])
    setSegmentos((seg.data as { tipo: string; valor: string; contactos: number }[]) ?? [])
    const c: Record<string, number> = {}
    for (const l of ld.data ?? []) c[l.current_stage] = (c[l.current_stage] ?? 0) + 1
    setConteos(c)
    setCampanas((cp.data as Progreso[]) ?? [])
    setIniciadasHoy(Number(ini.data ?? 0))
    setTopes(Object.fromEntries(
      ((tps.data ?? []) as { id: string; enviados_por_dia: number | null }[])
        .map((c) => [c.id, c.enviados_por_dia ?? LIMITE_META])
    ))

    // Salud del número: es lo que decide si se puede seguir enviando en frío.
    try {
      const r = await fetch('/api/wa/salud')
      if (r.ok) setSalud(await r.json())
    } catch { /* si Meta no responde, no bloqueamos la pantalla */ }

    setCargando(false)
  }, [supabase])

  useEffect(() => {
    let vivo = true
    void (async () => { await cargar(); if (!vivo) return })()
    return () => { vivo = false }
  }, [cargar])

  // Opciones del segmento elegido, y cuántos contactos abarca la selección.
  const opcionesSeg = segmentos.filter((s) => s.tipo === segTipo)
  const enSegmento = segSel.length
    ? opcionesSeg.filter((s) => segSel.includes(s.valor)).reduce((a, s) => a + s.contactos, 0)
    : etapasSel.reduce((s, e) => s + (conteos[e] ?? 0), 0)

  // Lo que REALMENTE va a entrar en cola: el segmento, recortado por "cuántos".
  const alcance = cuantos > 0 ? Math.min(cuantos, enSegmento) : enSegmento
  const plantillaSel = PLANTILLAS.find((p) => p.name === plantilla)
  /**
   * Dos cupos distintos, que estaban mezclados en uno y el botón mentía.
   *
   * `tope` es el deslizador del formulario de campaña NUEVA (por defecto 200).
   * Se estaba usando también para calcular cuánto puede enviar una campaña YA
   * creada, así que un botón anunciaba "Enviar 135" cuando el servidor iba a
   * mandar 30 y cortar. La cuenta buena estaba del lado del servidor —no se
   * envió de más— pero el número en pantalla era falso.
   *
   *  · cupoMeta      — lo que queda del límite de Meta para el NÚMERO. Es
   *                    global y es lo que muestra la tarjeta de arriba.
   *  · cupoDe(camp)  — lo que puede enviar ESA campaña: su propio tope diario
   *                    menos lo ya iniciado. Es la fórmula del servidor.
   */
  const cupoMeta = Math.max(0, LIMITE_META - iniciadasHoy)
  const cupoDe = (campaignId: string) => {
    const t = topes[campaignId] ?? LIMITE_META
    return Math.max(0, Math.min(t, LIMITE_META) - iniciadasHoy)
  }
  const dias = cupoMeta > 0 ? Math.ceil(alcance / Math.min(tope, LIMITE_META)) : 0
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
        p_campaign_id: camp.id,
        p_etapas: etapasSel,
        p_canales: null,
        // El límite ahora SÍ viaja: la campaña encola exactamente los que
        // pediste. Antes iba en null y encolaba los 464 de la etapa, dejando
        // que el tope diario goteara — que no es lo mismo que "mándale a 20".
        p_limite: cuantos > 0 ? cuantos : null,
        p_rubros:   segTipo === 'rubro'  && segSel.length ? segSel : null,
        p_ciudades: null,
        p_estados:  segTipo === 'estado' && segSel.length ? segSel : null,
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

        // Va como error rojo y no como avance: sin eso el corte por
        // configuración terminaba mostrando "Listo: 0 enviados", que se lee
        // como que ya no quedaba nadie a quien escribirle.
        if (d.detenida) { setError(d.mensaje); setAvance(`${total} enviados antes de parar.`); break }
        if (d.terminada || d.enviados === 0) { setAvance(`Listo: ${total} enviados${fallos ? `, ${fallos} fallidos` : ''}.`); break }
      }
      await cargar()
    } catch {
      setError('Se cortó la conexión. Los enviados quedaron registrados; puedes retomar.')
    } finally { setEnviando(null) }
  }

  if (cargando) {
    return <div className="bg-[var(--card)] rounded-2xl p-8 border border-[var(--border)] text-center">
      <p className="text-sm text-[var(--text-muted)]">Cargando…</p>
    </div>
  }

  return (
    <div className="space-y-4">
      {/* ── Salud del número: la alerta temprana ── */}
      {salud && (
        <div className={`rounded-2xl p-4 border ${
          salud.calidad === 'RED' ? 'bg-red-50 border-red-300'
          : salud.calidad === 'YELLOW' ? 'bg-amber-50 border-amber-300'
          : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              salud.calidad === 'RED' ? 'bg-red-500'
              : salud.calidad === 'YELLOW' ? 'bg-amber-500' : 'bg-emerald-500'
            }`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${
                salud.calidad === 'RED' ? 'text-red-900'
                : salud.calidad === 'YELLOW' ? 'text-amber-900' : 'text-emerald-900'
              }`}>
                Calidad del número: {
                  salud.calidad === 'GREEN' ? 'buena'
                  : salud.calidad === 'YELLOW' ? 'en riesgo'
                  : salud.calidad === 'RED' ? 'crítica' : 'sin datos aún'
                }
                {salud.limite && <span className="font-normal opacity-70"> · límite {salud.limite}</span>}
              </p>
              {salud.aviso && (
                <p className={`text-xs mt-1 ${salud.calidad === 'RED' ? 'text-red-800' : 'text-amber-800'}`}>
                  {salud.aviso}
                </p>
              )}
              {!salud.aviso && (
                <p className="text-xs text-emerald-800 mt-0.5">
                  Meta la calcula con los bloqueos y reportes de los últimos 7 días.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cupo del día ── */}
      <div className={`rounded-2xl p-4 border ${
        cupoMeta === 0 ? 'bg-red-50 border-red-200' : 'bg-[var(--card)] border-[var(--border)]'
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
              {cupoMeta > 0
                ? `Puedes iniciar ${cupoMeta} conversaciones más hoy.`
                : 'Cupo agotado. Se libera a medida que pasan las 24 h de cada envío.'}
            </p>
          </div>
          <div className="w-14 h-14 flex-shrink-0 relative">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                stroke={cupoMeta === 0 ? '#DC2626' : 'var(--primary)'}
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
                  disabled={enviando !== null || cupoDe(c.campaign_id) === 0 || salud?.seguroEnviar === false}
                  className="px-4 py-3 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 transition-all"
                >
                  {enviando === c.campaign_id ? 'Enviando…' : salud?.seguroEnviar === false ? 'Envío bloqueado' : `Enviar ${Math.min(c.pendientes, cupoDe(c.campaign_id))}`}
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

          {/* ── Segmento: el grupo dentro de la etapa ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Grupo <span className="font-medium normal-case tracking-normal">(opcional)</span>
              </label>
              <div className="flex gap-1">
                {(['rubro', 'estado'] as const).map((t) => (
                  <button key={t} type="button"
                    onClick={() => { setSegTipo(t); setSegSel([]) }}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                      segTipo === t ? 'bg-[var(--dark)] text-white border-[var(--dark)]'
                                    : 'bg-[var(--bg-alt)] text-[var(--text-secondary)] border-[var(--border)]'
                    }`}>
                    Por {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {opcionesSeg.length === 0 && (
                <p className="text-[11px] text-[var(--text-muted)]">Los contactos cargados no tienen {segTipo}.</p>
              )}
              {opcionesSeg.map((s) => {
                const sel = segSel.includes(s.valor)
                return (
                  <button key={s.valor} type="button"
                    onClick={() => setSegSel((p) => sel ? p.filter((x) => x !== s.valor) : [...p, s.valor])}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      sel ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-[var(--bg-alt)] text-[var(--text-secondary)] border-[var(--border)]'
                    }`}>
                    {s.valor} <span className="opacity-70">{s.contactos}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              {segSel.length ? `${enSegmento} contactos en el grupo elegido.` : 'Sin elegir grupo, entran todos los de la etapa.'}
            </p>
          </div>

          {/* ── Cuántos entran a ESTA campaña ── */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Cuántos mandar — {cuantos > 0 ? cuantos : 'todos'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[10, 20, 30, 50, 0].map((n) => (
                <button key={n} type="button" onClick={() => setCuantos(n)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    cuantos === n ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                  : 'bg-[var(--bg-alt)] text-[var(--text-secondary)] border-[var(--border)]'
                  }`}>
                  {n === 0 ? 'Todos' : n}
                </button>
              ))}
            </div>
            {/* Esto es lo que separa "mándale a 20" de "gotear 20 por día sobre
                toda la lista": la campaña encola exactamente esta cantidad. */}
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              La campaña queda cerrada en {cuantos > 0 ? `${alcance} contacto${alcance === 1 ? '' : 's'}` : 'todo el grupo'}
              {cuantos > 0 && ', y no crece después. Entran primero los mejor calificados.'}
            </p>
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
                : alcance > 0 ? 'Entran todos hoy.' : 'Elige al menos una etapa con contactos.'}
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
              {plantillaSel?.category === 'MARKETING' && (
                <><br /><br />
                Esta es de <strong>MARKETING</strong> y va a contactos que no dieron permiso.
                Empieza con una tanda chica (30–50), mira la calidad del número al día siguiente,
                y ahí sí sigues. Si aparecen bloqueos, el mensaje es el problema — no el volumen.</>
              )}
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
