'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { firstError } from '@/lib/supabase/errors'
import { normalizePhoneVE } from '@/lib/whatsapp'
import { ICONO_ACTIVIDAD, IconNota, IconEtapa, IconCarpeta, IconWhatsApp, IconUsuario, IconLista } from '@/components/icons'

type Lead = {
  id: string; name: string | null; phone: string | null; business_name: string | null
  source_channel: string; current_stage: string; plan_interested: string | null
  amount_quoted: number | null; amount_paid: number | null; notes: string | null
  ref_code: string | null; created_at: string; updated_at: string
}
type Stage = { slug: string; label: string; sort_order: number; is_won: boolean; is_lost: boolean; win_probability: number }
type Activity = { id: number; lead_id: string; activity_type: string; content: string; created_at: string }
type Transition = { from_stage: string | null; to_stage: string; transitioned_at: string }

const STAGE_THEME: Record<string, { border: string; dot: string; bg: string; tabActive: string }> = {
  conversando:     { border: 'border-t-blue-400',    dot: 'bg-blue-400',    bg: 'bg-blue-50/60',    tabActive: 'bg-blue-500 text-white' },
  por_cobrar:      { border: 'border-t-amber-400',   dot: 'bg-amber-400',   bg: 'bg-amber-50/60',   tabActive: 'bg-amber-500 text-white' },
  prediseno_curso: { border: 'border-t-purple-400',  dot: 'bg-purple-400',  bg: 'bg-purple-50/60',  tabActive: 'bg-purple-500 text-white' },
  esperando_ok:    { border: 'border-t-indigo-400',  dot: 'bg-indigo-400',  bg: 'bg-indigo-50/60',  tabActive: 'bg-indigo-500 text-white' },
  en_produccion:   { border: 'border-t-emerald-500', dot: 'bg-emerald-500', bg: 'bg-emerald-50/60', tabActive: 'bg-emerald-500 text-white' },
  entregado_final: { border: 'border-t-teal-500',    dot: 'bg-teal-500',    bg: 'bg-teal-50/60',    tabActive: 'bg-teal-500 text-white' },
}
const PLAN_LABELS: Record<string, string> = { pre_diseno: 'Pre-diseño', landing_page: 'Landing', sitio_web: 'Sitio Web' }
const SOURCE_LABELS: Record<string, string> = { landing_page: 'Landing', instagram_dm: 'Instagram', referral: 'Referido', meta_ads_direct: 'Meta Ads', organic_wa: 'WhatsApp', other: 'Otro' }
const ACTIVITY_LABELS: Record<string, string> = { note: 'Nota', call: 'Llamada', message: 'Mensaje', email: 'Correo', task: 'Tarea', stage_change: 'Cambio de etapa', system: 'Sistema' }

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mes`
}

function getDealAge(date: string): { text: string; days: number } {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days === 0) return { text: 'Hoy', days }
  if (days === 1) return { text: 'Ayer', days }
  return { text: `${days}d`, days }
}

function rottingLevel(days: number, stage: string): 'ok' | 'warm' | 'hot' {
  // Días de tolerancia por etapa. 'Por cobrar' es el más corto a propósito: es
  // el momento donde se gana o se pierde la venta.
  const thresholds: Record<string, number> = { conversando: 2, por_cobrar: 1, prediseno_curso: 2, esperando_ok: 3, en_produccion: 5, entregado_final: 7 }
  const limit = thresholds[stage] || 3
  if (days >= limit * 2) return 'hot'
  if (days >= limit) return 'warm'
  return 'ok'
}

const ROTTING_STYLES = {
  ok: '',
  warm: 'ring-1 ring-amber-300 bg-amber-50/30',
  hot: 'ring-1 ring-red-300 bg-red-50/30',
}
const ROTTING_BADGE = {
  ok: 'text-[var(--text-muted)]',
  warm: 'text-amber-600 font-bold',
  hot: 'text-red-500 font-bold animate-pulse-soft',
}

export default function PipelinePage() {
  const supabase = createClient()
  const [stages, setStages] = useState<Stage[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewLead, setShowNewLead] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  // null y no un slug quemado: la 008 renombró las etapas y esto dejaba el
  // panel móvil apuntando a una pestaña inexistente, mostrando "Sin leads"
  // con 630 leads cargados. Se fija al cargar, con la primera etapa real.
  const [mobileTab, setMobileTab] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterPlan, setFilterPlan] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [stagesRes, leadsRes] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('sort_order'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ])
    // Antes: `setLeads(l || [])` — un fallo de RLS se veía igual que "no hay leads".
    setLoadError(firstError({ etapas: stagesRes, leads: leadsRes }))
    const etapas = stagesRes.data || []
    setStages(etapas)
    setMobileTab((actual) => actual ?? etapas.find((e) => !e.is_lost)?.slug ?? null)
    setLeads(leadsRes.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // ?lead=<id> abre la ficha directo. Es lo que usa el enlace "Ver ficha" del
  // Inbox: antes las dos pantallas eran islas sin ida ni vuelta.
  const params = useSearchParams()
  useEffect(() => {
    const id = params.get('lead')
    if (!id || editLead) return
    const l = leads.find((x) => x.id === id)
    if (l) setEditLead(l)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, leads])

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (search) {
        const q = search.toLowerCase()
        if (![l.name, l.phone, l.business_name, l.ref_code].filter(Boolean).some(f => f!.toLowerCase().includes(q))) return false
      }
      if (filterChannel && l.source_channel !== filterChannel) return false
      if (filterPlan && l.plan_interested !== filterPlan) return false
      return true
    })
  }, [leads, search, filterChannel, filterPlan])

  const hasActiveFilters = search || filterChannel || filterPlan

  // Forecast
  const forecast = useMemo(() => {
    let weighted = 0, unweighted = 0
    filteredLeads.filter(l => l.current_stage !== 'perdido').forEach(l => {
      const amt = l.amount_quoted || 0
      const prob = stages.find(s => s.slug === l.current_stage)?.win_probability || 0
      unweighted += amt
      weighted += amt * (prob / 100)
    })
    return { weighted: Math.round(weighted), unweighted: Math.round(unweighted) }
  }, [filteredLeads, stages])

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }, [])

  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    updateScrollIndicators()
    el.addEventListener('scroll', updateScrollIndicators, { passive: true })
    const ro = new ResizeObserver(updateScrollIndicators); ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollIndicators); ro.disconnect() }
  }, [loading, updateScrollIndicators])

  function scrollBoard(dir: 'left' | 'right') { scrollRef.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' }) }

  async function moveToStage(leadId: string, newStage: string) {
    const previousStage = leads.find(l => l.id === leadId)?.current_stage
    const updates: Record<string, unknown> = { current_stage: newStage }
    const stage = stages.find(s => s.slug === newStage)
    if (stage?.is_won || stage?.is_lost) updates.closed_at = new Date().toISOString()

    setActionError(null)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, current_stage: newStage } : l))

    const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
    if (error) {
      // Rollback. Sin esto la tarjeta se queda movida en pantalla aunque el UPDATE
      // haya fallado — recargas y volvió a su sitio, sin ninguna explicación.
      if (previousStage) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, current_stage: previousStage } : l))
      }
      setActionError(`No se pudo mover el lead: ${error.message}`)
    }
  }

  async function deleteLead(leadId: string) {
    setActionError(null)
    const { error } = await supabase.from('leads').delete().eq('id', leadId)
    if (error) { setActionError(`No se pudo eliminar el lead: ${error.message}`); return }
    setLeads(prev => prev.filter(l => l.id !== leadId)); setEditLead(null)
  }

  function exportCsv() {
    const headers = ['Nombre','Teléfono','Negocio','Canal','Etapa','Plan','Cotizado','Pagado','Ref Code','Fecha','Notas']
    const rows = filteredLeads.map(l => [l.name||'',l.phone||'',l.business_name||'',SOURCE_LABELS[l.source_channel]||l.source_channel,stages.find(s=>s.slug===l.current_stage)?.label||l.current_stage,PLAN_LABELS[l.plan_interested||'']||l.plan_interested||'',l.amount_quoted||'',l.amount_paid||'',l.ref_code||'',new Date(l.created_at).toLocaleDateString('es-VE'),(l.notes||'').replace(/[\n\r,]/g,' ')])
    const csv = [headers,...rows].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href=url; a.download=`tuwebgo-leads-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div></div>

  const visibleStages = stages.filter(s => !s.is_lost)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[family-name:var(--font-display)] tracking-tight">Pipeline</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-sm text-[var(--text-secondary)]">{filteredLeads.length}{hasActiveFilters ? ` de ${leads.length}` : ''} leads</p>
            {forecast.unweighted > 0 && (
              <>
                <span className="text-[var(--border)]">·</span>
                <p className="text-sm text-[var(--text-secondary)]">Valor: <span className="font-semibold text-[var(--dark)]">${forecast.unweighted}</span></p>
                <span className="text-[var(--border)]">·</span>
                <p className="text-sm text-[var(--text-secondary)]">Forecast: <span className="font-semibold text-[var(--primary)]">${forecast.weighted}</span></p>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCsv} title="Exportar CSV" className="px-3 py-2 sm:py-2.5 rounded-xl border border-[var(--border)] text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-alt)] transition-all cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          <button onClick={() => setShowNewLead(true)} className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs sm:text-sm font-semibold font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.97]">+ Lead</button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-2 items-center mb-3">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, teléfono, negocio..."
            className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[var(--border)] bg-white text-sm text-[var(--dark)] placeholder:text-[var(--text-muted)] transition-all" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--dark)] cursor-pointer"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>}
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${showFilters || hasActiveFilters ? 'border-[var(--primary)] bg-[var(--primary-glow)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-alt)]'}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
        </button>
      </div>
      {showFilters && (
        <div className="flex gap-2 items-center mb-3 animate-fade-in flex-wrap">
          <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-white text-sm text-[var(--dark)]"><option value="">Todos los canales</option>{Object.entries(SOURCE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} className="px-3 py-2 rounded-xl border border-[var(--border)] bg-white text-sm text-[var(--dark)]"><option value="">Todos los planes</option>{Object.entries(PLAN_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
          {hasActiveFilters && <button onClick={() => {setSearch('');setFilterChannel('');setFilterPlan('')}} className="px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-all cursor-pointer">Limpiar</button>}
        </div>
      )}

      {/* Errores visibles: antes fallaban en silencio y parecía "no hay datos" */}
      {(loadError || actionError) && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 animate-fade-in">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-700">{actionError ? 'La operación falló' : 'No se pudieron cargar los datos'}</p>
            <p className="text-xs text-red-600 mt-0.5 break-words font-mono">{actionError || loadError}</p>
          </div>
          <button onClick={() => { setActionError(null); setLoadError(null) }} className="text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Sin etapas no hay tablero que pintar. Antes el render seguía y la pantalla
          quedaba literalmente vacía: título, "0 leads", buscador y nada debajo. */}
      {visibleStages.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-[var(--border)]">
          <IconCarpeta className="w-9 h-9 mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.4} />
          <p className="text-sm font-semibold text-[var(--dark)]">No se cargaron las etapas del pipeline</p>
          <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-sm mx-auto">
            La tabla <code className="font-mono">pipeline_stages</code> no devolvió ninguna fila.
            Suele ser un permiso de RLS o que la sesión expiró.
          </p>
          <button onClick={() => { setLoading(true); fetchData() }} className="mt-5 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] transition-all cursor-pointer">
            Reintentar
          </button>
        </div>
      ) : (
      <>
      {/* ── MOBILE ── */}
      <div className="md:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4" style={{scrollbarWidth:'none'}}>
          {visibleStages.map(stage => {
            const count = filteredLeads.filter(l => l.current_stage === stage.slug).length
            const theme = STAGE_THEME[stage.slug]; const active = mobileTab === stage.slug
            return <button key={stage.slug} onClick={() => setMobileTab(stage.slug)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold font-[family-name:var(--font-display)] transition-all cursor-pointer ${active ? theme?.tabActive||'bg-[var(--primary)] text-white':'bg-white text-[var(--text-secondary)] border border-[var(--border)]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${active?'bg-white/70':theme?.dot||'bg-gray-400'}`}></span>{stage.label}<span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${active?'bg-white/20':'bg-[var(--bg-alt)]'}`}>{count}</span>
            </button>
          })}
        </div>
        <div className="space-y-2.5 mt-1">
          {filteredLeads.filter(l => l.current_stage === mobileTab).map(lead => <LeadCard key={lead.id} lead={lead} onClick={() => setEditLead(lead)} />)}
          {filteredLeads.filter(l => l.current_stage === mobileTab).length === 0 && <div className="text-center py-12 bg-white rounded-2xl border border-[var(--border)]"><p className="text-sm text-[var(--text-muted)]">{hasActiveFilters ? 'Sin resultados' : 'Sin leads'}</p></div>}
        </div>
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:block relative">
        {canScrollLeft && <><button onClick={() => scrollBoard('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 border border-[var(--border)] shadow-lg flex items-center justify-center cursor-pointer hover:bg-white -ml-3"><svg className="w-5 h-5 text-[var(--dark)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></button><div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[var(--bg)] to-transparent z-10 pointer-events-none"></div></>}
        {canScrollRight && <><button onClick={() => scrollBoard('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 border border-[var(--border)] shadow-lg flex items-center justify-center cursor-pointer hover:bg-white -mr-3"><svg className="w-5 h-5 text-[var(--dark)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></button><div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[var(--bg)] to-transparent z-10 pointer-events-none"></div></>}
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-3 scroll-smooth" style={{scrollbarWidth:'thin'}}>
          {visibleStages.map(stage => {
            const stageLeads = filteredLeads.filter(l => l.current_stage === stage.slug)
            const theme = STAGE_THEME[stage.slug]||{border:'border-t-gray-400',dot:'bg-gray-400',bg:'bg-gray-400/5'}
            const isDT = dragOver === stage.slug
            return (
              <div key={stage.slug} className={`flex-shrink-0 rounded-2xl border border-[var(--border)] transition-all duration-200 ${theme.bg} ${isDT?'ring-2 ring-[var(--primary)] ring-offset-2 scale-[1.01]':''}`}
                style={{width:'clamp(220px, calc((100% - 60px) / 6), 300px)',minWidth:'220px'}}
                onDragOver={e=>{e.preventDefault();setDragOver(stage.slug)}} onDragLeave={()=>setDragOver(null)} onDrop={()=>{if(draggedLead){moveToStage(draggedLead,stage.slug);setDraggedLead(null);setDragOver(null)}}}>
                <div className={`p-3 lg:p-4 border-t-[3px] rounded-t-2xl ${theme.border}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.dot}`}></span><h3 className="font-bold text-[12px] lg:text-[13px] text-[var(--dark)] font-[family-name:var(--font-display)] truncate">{stage.label}</h3></div>
                    <span className="text-[10px] lg:text-[11px] font-bold text-[var(--text-muted)] bg-white/80 px-1.5 lg:px-2 py-0.5 rounded-full border border-[var(--border-light)] flex-shrink-0 ml-1">{stageLeads.length}</span>
                  </div>
                </div>
                <div className="p-2 lg:p-2.5 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {stageLeads.map(lead => {
                    const age = getDealAge(lead.updated_at || lead.created_at)
                    const rot = rottingLevel(age.days, lead.current_stage)
                    return (
                      <div key={lead.id} draggable onDragStart={()=>setDraggedLead(lead.id)} onDragEnd={()=>{setDraggedLead(null);setDragOver(null)}} onClick={()=>setEditLead(lead)}
                        className={`bg-white rounded-xl p-3 border border-[var(--border-light)] shadow-sm hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing active:scale-[0.97] group ${draggedLead===lead.id?'opacity-30 scale-95':''} ${ROTTING_STYLES[rot]}`}>
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-semibold text-[13px] text-[var(--dark)] leading-snug truncate">{lead.name||'Sin nombre'}</p>
                          <span className={`text-[9px] flex-shrink-0 mt-0.5 ${ROTTING_BADGE[rot]}`}>{age.text}</span>
                        </div>
                        {lead.business_name && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">{lead.business_name}</p>}
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {lead.plan_interested && <span className="text-[9px] lg:text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--bg-alt)] text-[var(--primary)] border border-[var(--border-light)]">{PLAN_LABELS[lead.plan_interested]||lead.plan_interested}</span>}
                          {lead.amount_paid ? <span className="text-[9px] lg:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">${lead.amount_paid}</span>
                          : lead.amount_quoted ? <span className="text-[9px] lg:text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">~${lead.amount_quoted}</span> : null}
                        </div>
                      </div>
                    )
                  })}
                  {stageLeads.length===0 && <div className={`text-center py-8 rounded-xl border-2 border-dashed border-[var(--border-light)] ${isDT?'bg-[var(--primary-glow)] border-[var(--primary)]':''} transition-all`}><p className="text-[11px] text-[var(--text-muted)]">{isDT?'Soltar aquí':hasActiveFilters?'Sin resultados':'Vacío'}</p></div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </>
      )}

      {showNewLead && <NewLeadModal onClose={()=>setShowNewLead(false)} onSave={async d=>{
        setActionError(null)
        const { error } = await supabase.from('leads').insert(d)
        setShowNewLead(false)
        if (error) { setActionError(`No se pudo crear el lead: ${error.message}`); return }
        fetchData()
      }} />}
      {editLead && <EditLeadModal lead={editLead} stages={stages} supabase={supabase} onClose={()=>setEditLead(null)} onSave={async d=>{
        setActionError(null)
        const { error } = await supabase.from('leads').update(d).eq('id',editLead.id)
        setEditLead(null)
        if (error) { setActionError(`No se pudieron guardar los cambios: ${error.message}`); return }
        fetchData()
      }} onDelete={()=>deleteLead(editLead.id)} />}
    </div>
  )
}

// ── Lead Card (mobile) with age + rotting ──
function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const age = getDealAge(lead.updated_at || lead.created_at)
  const rot = rottingLevel(age.days, lead.current_stage)
  return (
    <div onClick={onClick} className={`bg-white rounded-xl p-4 border border-[var(--border-light)] shadow-sm active:scale-[0.98] transition-all cursor-pointer ${ROTTING_STYLES[rot]}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[var(--dark)] truncate">{lead.name||'Sin nombre'}</p>
          {lead.business_name && <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{lead.business_name}</p>}
        </div>
        <span className={`text-[10px] flex-shrink-0 ${ROTTING_BADGE[rot]}`}>{age.text}</span>
      </div>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {lead.plan_interested && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-alt)] text-[var(--primary)] border border-[var(--border-light)]">{PLAN_LABELS[lead.plan_interested]||lead.plan_interested}</span>}
        {lead.amount_paid ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">${lead.amount_paid}</span>
        : lead.amount_quoted ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">~${lead.amount_quoted}</span> : null}

        {/* Antes esto abría wa.me directo: el mensaje no pasaba por la Cloud API,
            no quedaba en wa_messages y ni el Inbox ni Sofía lo veían nunca.
            Ahora lleva a la conversación, que es donde vive el historial real. */}
        {normalizePhoneVE(lead.phone) && (
          <Link
            href={`/dashboard/inbox?tel=${normalizePhoneVE(lead.phone)}`}
            onClick={(e) => e.stopPropagation()}
            title="Abrir la conversación en Inbox"
            aria-label={`Abrir conversación con ${lead.name || 'el lead'}`}
            className="ml-auto w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all cursor-pointer flex-shrink-0"
          >
            <IconWhatsApp className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

// ── New Lead Modal ──
function NewLeadModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Record<string,unknown>) => void }) {
  const [form, setForm] = useState({name:'',phone:'',business_name:'',source_channel:'landing_page',plan_interested:'',notes:''})
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}))
  return (
    <Modal title="Nuevo Lead" icon={<IconUsuario className="w-4 h-4" />} onClose={onClose}>
      <div className="space-y-4">
        <Input label="Nombre" value={form.name} onChange={v=>set('name',v)} autoFocus />
        <Input label="Teléfono" value={form.phone} onChange={v=>set('phone',v)} />
        <Input label="Negocio" value={form.business_name} onChange={v=>set('business_name',v)} />
        <Select label="Canal" value={form.source_channel} onChange={v=>set('source_channel',v)} options={Object.entries(SOURCE_LABELS).map(([v,l])=>({value:v,label:l}))} />
        <Select label="Plan" value={form.plan_interested} onChange={v=>set('plan_interested',v)} options={[{value:'',label:'Sin definir'},...Object.entries(PLAN_LABELS).map(([v,l])=>({value:v,label:l}))]} />
        <Textarea label="Notas" value={form.notes} onChange={v=>set('notes',v)} />
        <BtnPrimary onClick={()=>onSave({...form,plan_interested:form.plan_interested||null,notes:form.notes||null})}>Crear lead</BtnPrimary>
      </div>
    </Modal>
  )
}

// LinkRefModal eliminado. Pedía el código [ref:TW-xxxx] que el pixel ya no
// inyecta en el mensaje, y su createFromSession insertaba un lead sin teléfono
// ni nombre — duplicando el que el webhook ya crea solo. El rescate de sesiones
// huérfanas hoy lo hace wa_atribuir_por_ventana en el webhook.

// ── Edit Lead Modal with Timeline ──
function EditLeadModal({ lead, stages, supabase, onClose, onSave, onDelete }: {
  lead: Lead; stages: Stage[]; supabase: ReturnType<typeof createClient>
  onClose: () => void; onSave: (d: Record<string,unknown>) => void; onDelete: () => void
}) {
  const [form, setForm] = useState({name:lead.name||'',phone:lead.phone||'',business_name:lead.business_name||'',current_stage:lead.current_stage,plan_interested:lead.plan_interested||'',amount_quoted:lead.amount_quoted?.toString()||'',amount_paid:lead.amount_paid?.toString()||'',notes:lead.notes||''})
  const [sessionInfo, setSessionInfo] = useState<Record<string,string>|null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState('note')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'edit'|'timeline'>('edit')
  const [modalError, setModalError] = useState<string|null>(null)
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}))

  const reloadActivities = useCallback(async () => {
    const {data,error} = await supabase.from('lead_activities').select('*').eq('lead_id',lead.id).order('created_at',{ascending:false})
    if(error){ setModalError(error.message); return }
    setActivities(data||[])
  }, [lead.id, supabase])

  useEffect(() => {
    if(lead.ref_code) supabase.from('sessions').select('*').eq('ref_code',lead.ref_code).single().then(({data})=>{if(data)setSessionInfo(data)})
    supabase.from('lead_activities').select('*').eq('lead_id',lead.id).order('created_at',{ascending:false}).then(({data,error})=>{if(error){setModalError(error.message);return}setActivities(data||[])})
    supabase.from('stage_transitions').select('from_stage,to_stage,transitioned_at').eq('lead_id',lead.id).order('transitioned_at',{ascending:false}).then(({data,error})=>{if(error){setModalError(error.message);return}setTransitions(data||[])})
  }, [lead, supabase])

  async function addNote() {
    if(!newNote.trim()) return
    setModalError(null)
    const {error} = await supabase.from('lead_activities').insert({lead_id:lead.id,activity_type:noteType,content:newNote.trim()})
    if(error){ setModalError(`No se pudo guardar la nota: ${error.message}`); return }
    setNewNote('')
    await reloadActivities()
  }

  const age = getDealAge(lead.created_at)

  return (
    <Modal title={lead.name||'Lead'} icon={<IconLista className="w-4 h-4" />} onClose={onClose}>
      {/* Un botón, no un panel: escribir se hace en el Inbox, que es donde vive
          la conversación completa y donde Sofía puede seguir. Duplicar acá un
          compositor de mensajes creaba un tercer camino que confundía. */}
      {normalizePhoneVE(lead.phone) && (
        <Link
          href={`/dashboard/inbox?tel=${normalizePhoneVE(lead.phone)}`}
          className="flex items-center justify-center gap-2 w-full mb-4 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm font-[family-name:var(--font-display)] hover:brightness-110 transition-all active:scale-[0.98]"
        >
          <IconWhatsApp className="w-4 h-4" />
          Ir a la conversación
        </Link>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[var(--bg-alt)] p-1 rounded-xl">
        <button onClick={()=>setTab('edit')} className={`flex-1 py-2 rounded-lg text-xs font-semibold font-[family-name:var(--font-display)] transition-all cursor-pointer ${tab==='edit'?'bg-white text-[var(--dark)] shadow-sm':'text-[var(--text-muted)]'}`}>Datos</button>
        <button onClick={()=>setTab('timeline')} className={`flex-1 py-2 rounded-lg text-xs font-semibold font-[family-name:var(--font-display)] transition-all cursor-pointer ${tab==='timeline'?'bg-white text-[var(--dark)] shadow-sm':'text-[var(--text-muted)]'}`}>Timeline ({activities.length + transitions.length})</button>
      </div>

      {modalError && (
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 break-words">{modalError}</p>
        </div>
      )}

      {tab === 'edit' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2 text-xs text-[var(--text-muted)]">
            <span>Creado {age.text}</span>
            <span>·</span>
            <span>{SOURCE_LABELS[lead.source_channel]||lead.source_channel}</span>
            {lead.ref_code && <><span>·</span><span className="font-mono">{lead.ref_code}</span></>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre" value={form.name} onChange={v=>set('name',v)} />
            <Input label="Teléfono" value={form.phone} onChange={v=>set('phone',v)} />
          </div>
          <Input label="Negocio" value={form.business_name} onChange={v=>set('business_name',v)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Etapa" value={form.current_stage} onChange={v=>set('current_stage',v)} options={stages.map(s=>({value:s.slug,label:s.label}))} />
            <Select label="Plan" value={form.plan_interested} onChange={v=>set('plan_interested',v)} options={[{value:'',label:'Sin definir'},...Object.entries(PLAN_LABELS).map(([v,l])=>({value:v,label:l}))]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cotizado ($)" value={form.amount_quoted} onChange={v=>set('amount_quoted',v)} type="number" />
            <Input label="Pagado ($)" value={form.amount_paid} onChange={v=>set('amount_paid',v)} type="number" />
          </div>
          {sessionInfo && (
            <div className="bg-gradient-to-br from-[var(--bg-alt)] to-[var(--bg)] rounded-xl p-3 border border-[var(--border-light)]">
              <p className="text-[9px] font-bold text-[var(--primary)] uppercase tracking-wider font-[family-name:var(--font-display)] mb-2">Sesión web</p>
              <div className="grid grid-cols-2 gap-2"><InfoChip label="Dispositivo" value={sessionInfo.device_type||'N/A'} />{sessionInfo.utm_source&&<InfoChip label="Fuente" value={sessionInfo.utm_source}/>}<InfoChip label="Visita" value={new Date(sessionInfo.first_seen_at).toLocaleString('es-VE')}/></div>
            </div>
          )}
          <BtnPrimary onClick={()=>onSave({...form,amount_quoted:form.amount_quoted?parseFloat(form.amount_quoted):null,amount_paid:form.amount_paid?parseFloat(form.amount_paid):null,plan_interested:form.plan_interested||null})}>Guardar cambios</BtnPrimary>
          <div className="pt-3 border-t border-[var(--border-light)]">
            {!confirmDelete ? <button onClick={()=>setConfirmDelete(true)} className="w-full py-2 text-xs text-red-400 hover:text-red-600 cursor-pointer font-[family-name:var(--font-display)]">Eliminar lead</button>
            : <div className="flex gap-2 animate-fade-in"><button onClick={onDelete} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 cursor-pointer active:scale-[0.98]">Confirmar</button><button onClick={()=>setConfirmDelete(false)} className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-secondary)] cursor-pointer">Cancelar</button></div>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick note */}
          <div className="flex gap-2">
            <select value={noteType} onChange={e=>setNoteType(e.target.value)} className="px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm w-28">{Object.entries(ACTIVITY_LABELS).filter(([k])=>!['stage_change','system'].includes(k)).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
            <input type="text" value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Agregar nota rápida..." onKeyDown={e=>{if(e.key==='Enter')addNote()}}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-base sm:text-sm text-[var(--dark)] placeholder:text-[var(--text-muted)]" />
            <button onClick={addNote} disabled={!newNote.trim()} className="px-3 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-40 cursor-pointer">+</button>
          </div>

          {/* Timeline */}
          <div className="space-y-0 relative">
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-[var(--border-light)]"></div>
            {/* Merge activities + transitions, sort by date desc */}
            {[
              ...activities.map(a => ({ date: a.created_at, type: 'activity' as const, data: a })),
              ...transitions.map(t => ({ date: t.transitioned_at, type: 'transition' as const, data: t })),
            ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item, i) => (
              <div key={i} className="flex gap-3 py-2 relative">
                <div className="w-9 h-9 rounded-full bg-white border border-[var(--border-light)] flex items-center justify-center text-sm flex-shrink-0 z-10">
                  {(() => { const I = item.type === 'transition' ? IconEtapa : (ICONO_ACTIVIDAD[(item.data as Activity).activity_type] ?? IconNota); return <I className="w-4 h-4 text-[var(--text-muted)]" /> })()}
                </div>
                <div className="flex-1 min-w-0">
                  {item.type === 'transition' ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--dark)]">{stages.find(s=>s.slug===(item.data as Transition).from_stage)?.label || 'Inicio'}</span>
                      {' → '}
                      <span className="font-semibold text-[var(--primary)]">{stages.find(s=>s.slug===(item.data as Transition).to_stage)?.label}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--dark)] break-words">{(item.data as Activity).content}</p>
                  )}
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{timeAgo(item.date)} — {new Date(item.date).toLocaleString('es-VE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
                </div>
              </div>
            ))}
            {activities.length === 0 && transitions.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-6">Sin actividad registrada</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Shared UI ──
function Modal({title,icon,onClose,children}:{title:string;icon?:React.ReactNode;onClose:()=>void;children:React.ReactNode}) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto" style={{pointerEvents:'none'}}>
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md my-8 shadow-2xl animate-fade-in-scale border border-[var(--border-light)]" style={{pointerEvents:'auto'}} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">{icon&&<span className="text-xl">{icon}</span>}<h2 className="font-bold text-lg text-[var(--dark)] font-[family-name:var(--font-display)] truncate">{title}</h2></div>
              <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--dark)] cursor-pointer p-1.5 rounded-lg hover:bg-[var(--bg-alt)]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div className="p-5">{children}</div>
          </div>
        </div>
      </div>
    </>
  )
}
function Input({label,value,onChange,type='text',autoFocus}:{label:string;value:string;onChange:(v:string)=>void;type?:string;autoFocus?:boolean}) { return <div><label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-display)]">{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} autoFocus={autoFocus} className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all"/></div> }
function Textarea({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) { return <div><label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-display)]">{label}</label><textarea value={value} onChange={e=>onChange(e.target.value)} rows={2} className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all resize-none"/></div> }
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}) { return <div><label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-display)]">{label}</label><select value={value} onChange={e=>onChange(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all">{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div> }
function BtnPrimary({onClick,children}:{onClick:()=>void;children:React.ReactNode}) { return <button onClick={onClick} className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.98]">{children}</button> }
function InfoChip({label,value}:{label:string;value:string}) { return <div className="bg-white rounded-lg px-2.5 py-1.5 border border-[var(--border-light)]"><p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{label}</p><p className="text-xs font-semibold text-[var(--dark)] truncate">{value}</p></div> }
