'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  nuevo:              { border: 'border-t-blue-400',    dot: 'bg-blue-400',    bg: 'bg-blue-50/60',     tabActive: 'bg-blue-500 text-white' },
  contactado:         { border: 'border-t-amber-400',   dot: 'bg-amber-400',   bg: 'bg-amber-50/60',    tabActive: 'bg-amber-500 text-white' },
  pre_diseno_enviado: { border: 'border-t-purple-400',  dot: 'bg-purple-400',  bg: 'bg-purple-50/60',   tabActive: 'bg-purple-500 text-white' },
  aprobado:           { border: 'border-t-indigo-400',  dot: 'bg-indigo-400',  bg: 'bg-indigo-50/60',   tabActive: 'bg-indigo-500 text-white' },
  pagado:             { border: 'border-t-emerald-500', dot: 'bg-emerald-500', bg: 'bg-emerald-50/60',  tabActive: 'bg-emerald-500 text-white' },
  entregado:          { border: 'border-t-teal-500',    dot: 'bg-teal-500',    bg: 'bg-teal-50/60',     tabActive: 'bg-teal-500 text-white' },
}
const PLAN_LABELS: Record<string, string> = { pre_diseno: 'Pre-diseño', landing_page: 'Landing', sitio_web: 'Sitio Web' }
const SOURCE_LABELS: Record<string, string> = { landing_page: 'Landing', instagram_dm: 'Instagram', referral: 'Referido', meta_ads_direct: 'Meta Ads', organic_wa: 'WhatsApp', other: 'Otro' }
const ACTIVITY_ICONS: Record<string, string> = { note: '📝', call: '📞', message: '💬', email: '📧', task: '✅', stage_change: '🔄', system: '⚙️' }

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
  const thresholds: Record<string, number> = { nuevo: 1, contactado: 2, pre_diseno_enviado: 3, aprobado: 3, pagado: 5, entregado: 7 }
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
  const [showLinkRef, setShowLinkRef] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState('nuevo')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterPlan, setFilterPlan] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const fetchData = useCallback(async () => {
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('sort_order'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ])
    setStages(s || []); setLeads(l || []); setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

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
    const updates: Record<string, unknown> = { current_stage: newStage }
    const stage = stages.find(s => s.slug === newStage)
    if (stage?.is_won || stage?.is_lost) updates.closed_at = new Date().toISOString()
    await supabase.from('leads').update(updates).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, current_stage: newStage } : l))
  }

  async function deleteLead(leadId: string) {
    await supabase.from('leads').delete().eq('id', leadId)
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
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">Pipeline</h1>
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
          <button onClick={() => setShowLinkRef(true)} className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[var(--green)] text-white text-xs sm:text-sm font-semibold font-[Space_Grotesk,sans-serif] hover:brightness-110 transition-all cursor-pointer shadow-md shadow-emerald-500/20 active:scale-[0.97]">
            <span className="flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg><span className="hidden sm:inline">Vincular</span> ref</span>
          </button>
          <button onClick={() => setShowNewLead(true)} className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs sm:text-sm font-semibold font-[Space_Grotesk,sans-serif] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.97]">+ Lead</button>
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

      {/* ── MOBILE ── */}
      <div className="md:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4" style={{scrollbarWidth:'none'}}>
          {visibleStages.map(stage => {
            const count = filteredLeads.filter(l => l.current_stage === stage.slug).length
            const theme = STAGE_THEME[stage.slug]; const active = mobileTab === stage.slug
            return <button key={stage.slug} onClick={() => setMobileTab(stage.slug)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold font-[Space_Grotesk,sans-serif] transition-all cursor-pointer ${active ? theme?.tabActive||'bg-[var(--primary)] text-white':'bg-white text-[var(--text-secondary)] border border-[var(--border)]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${active?'bg-white/70':theme?.dot||'bg-gray-400'}`}></span>{stage.label}<span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${active?'bg-white/20':'bg-[var(--bg-alt)]'}`}>{count}</span>
            </button>
          })}
        </div>
        <div className="space-y-2.5 mt-1">
          {filteredLeads.filter(l => l.current_stage === mobileTab).map(lead => <LeadCard key={lead.id} lead={lead} stages={stages} onClick={() => setEditLead(lead)} />)}
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
                    <div className="flex items-center gap-2 min-w-0"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.dot}`}></span><h3 className="font-bold text-[12px] lg:text-[13px] text-[var(--dark)] font-[Space_Grotesk,sans-serif] truncate">{stage.label}</h3></div>
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

      {showNewLead && <NewLeadModal onClose={()=>setShowNewLead(false)} onSave={async d=>{await supabase.from('leads').insert(d);setShowNewLead(false);fetchData()}} />}
      {showLinkRef && <LinkRefModal supabase={supabase} onClose={()=>setShowLinkRef(false)} onLinked={()=>{setShowLinkRef(false);fetchData()}} />}
      {editLead && <EditLeadModal lead={editLead} stages={stages} supabase={supabase} onClose={()=>setEditLead(null)} onSave={async d=>{await supabase.from('leads').update(d).eq('id',editLead.id);setEditLead(null);fetchData()}} onDelete={()=>deleteLead(editLead.id)} />}
    </div>
  )
}

// ── Lead Card (mobile) with age + rotting ──
function LeadCard({ lead, stages, onClick }: { lead: Lead; stages: Stage[]; onClick: () => void }) {
  const age = getDealAge(lead.updated_at || lead.created_at)
  const rot = rottingLevel(age.days, lead.current_stage)
  return (
    <div onClick={onClick} className={`bg-white rounded-xl p-4 border border-[var(--border-light)] shadow-sm active:scale-[0.98] transition-all cursor-pointer ${ROTTING_STYLES[rot]}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[var(--dark)]">{lead.name||'Sin nombre'}</p>
          {lead.business_name && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{lead.business_name}</p>}
        </div>
        <span className={`text-[10px] flex-shrink-0 ${ROTTING_BADGE[rot]}`}>{age.text}</span>
      </div>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {lead.plan_interested && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-alt)] text-[var(--primary)] border border-[var(--border-light)]">{PLAN_LABELS[lead.plan_interested]||lead.plan_interested}</span>}
        {lead.amount_paid ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">${lead.amount_paid}</span>
        : lead.amount_quoted ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">~${lead.amount_quoted}</span> : null}
      </div>
    </div>
  )
}

// ── New Lead Modal ──
function NewLeadModal({ onClose, onSave }: { onClose: () => void; onSave: (d: Record<string,unknown>) => void }) {
  const [form, setForm] = useState({name:'',phone:'',business_name:'',source_channel:'landing_page',plan_interested:'',notes:''})
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}))
  return (
    <Modal title="Nuevo Lead" icon="👤" onClose={onClose}>
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

// ── Link Ref ──
function LinkRefModal({ supabase, onClose, onLinked }: { supabase: ReturnType<typeof createClient>; onClose: () => void; onLinked: () => void }) {
  const [refCode, setRefCode] = useState(''); const [result, setResult] = useState<string|null>(null); const [loading, setLoading] = useState(false); const [sessionData, setSessionData] = useState<Record<string,string>|null>(null)
  async function handleLink() {
    setLoading(true);setResult(null); const code = refCode.trim()
    const { data: s } = await supabase.from('sessions').select('*').eq('ref_code',code).single()
    if (!s) { const {data:s2} = await supabase.from('sessions').select('*').eq('ref_code',code.toUpperCase()).single(); if(!s2){setResult('No se encontró sesión');setLoading(false);return}; setSessionData(s2) } else setSessionData(s)
    setLoading(false)
  }
  async function createFromSession() {
    if(!sessionData) return
    const {data:ev} = await supabase.from('events').select('event_data').eq('session_id',sessionData.id).eq('event_type','cta_click').order('created_at',{ascending:false}).limit(1)
    const plan = (ev?.[0]?.event_data as Record<string,string>)?.plan||null
    let src = 'landing_page'; if(['facebook','instagram','meta'].includes(sessionData.utm_source)) src='meta_ads_direct'
    const {data:lead} = await supabase.from('leads').insert({ref_code:sessionData.ref_code,source_channel:src,plan_interested:plan&&plan!=='generic'?plan:null}).select().single()
    if(lead){await supabase.from('sessions').update({lead_id:lead.id}).eq('id',sessionData.id);setResult('Lead creado y vinculado');setTimeout(onLinked,1200)}
  }
  return (
    <Modal title="Vincular ref code" icon="🔗" onClose={onClose}>
      <p className="text-sm text-[var(--text-secondary)] mb-4">Código <code className="bg-[var(--bg-alt)] px-1.5 py-0.5 rounded text-[var(--primary)] font-mono font-bold text-xs">[ref:TW-xxxx]</code> del WhatsApp</p>
      <div className="flex gap-2 mb-5">
        <input type="text" value={refCode} onChange={e=>setRefCode(e.target.value)} placeholder="TW-a3f2" className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--dark)] text-sm font-mono font-bold tracking-wider placeholder:text-[var(--text-muted)] placeholder:font-normal" autoFocus />
        <button onClick={handleLink} disabled={loading||!refCode.trim()} className="px-5 py-3 rounded-xl bg-[var(--green)] text-white font-semibold text-sm hover:brightness-110 disabled:opacity-40 cursor-pointer active:scale-[0.97]">{loading?'...':'Buscar'}</button>
      </div>
      {sessionData&&!result && <div className="bg-[var(--bg-alt)] rounded-xl p-4 mb-4 border border-[var(--border-light)] animate-fade-in-scale"><p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider font-[Space_Grotesk,sans-serif] mb-3">Sesión encontrada</p><div className="grid grid-cols-2 gap-2 text-xs mb-4"><InfoChip label="Dispositivo" value={sessionData.device_type||'N/A'} />{sessionData.utm_source&&<InfoChip label="Fuente" value={sessionData.utm_source} />}{sessionData.utm_campaign&&<InfoChip label="Campaña" value={sessionData.utm_campaign} />}<InfoChip label="Fecha" value={new Date(sessionData.first_seen_at).toLocaleString('es-VE')} /></div><BtnPrimary onClick={createFromSession}>Crear lead desde sesión</BtnPrimary></div>}
      {result && <p className={`text-sm text-center py-3 font-semibold animate-fade-in ${result.includes('No se')?'text-red-500':'text-emerald-600'}`}>{result}</p>}
    </Modal>
  )
}

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
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}))

  useEffect(() => {
    if(lead.ref_code) supabase.from('sessions').select('*').eq('ref_code',lead.ref_code).single().then(({data})=>{if(data)setSessionInfo(data)})
    supabase.from('lead_activities').select('*').eq('lead_id',lead.id).order('created_at',{ascending:false}).then(({data})=>setActivities(data||[]))
    supabase.from('stage_transitions').select('from_stage,to_stage,transitioned_at').eq('lead_id',lead.id).order('transitioned_at',{ascending:false}).then(({data})=>setTransitions(data||[]))
  }, [lead, supabase])

  async function addNote() {
    if(!newNote.trim()) return
    await supabase.from('lead_activities').insert({lead_id:lead.id,activity_type:noteType,content:newNote.trim()})
    setNewNote('')
    const {data} = await supabase.from('lead_activities').select('*').eq('lead_id',lead.id).order('created_at',{ascending:false})
    setActivities(data||[])
  }

  const age = getDealAge(lead.created_at)

  return (
    <Modal title={lead.name||'Lead'} icon="📋" onClose={onClose}>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[var(--bg-alt)] p-1 rounded-xl">
        <button onClick={()=>setTab('edit')} className={`flex-1 py-2 rounded-lg text-xs font-semibold font-[Space_Grotesk,sans-serif] transition-all cursor-pointer ${tab==='edit'?'bg-white text-[var(--dark)] shadow-sm':'text-[var(--text-muted)]'}`}>Datos</button>
        <button onClick={()=>setTab('timeline')} className={`flex-1 py-2 rounded-lg text-xs font-semibold font-[Space_Grotesk,sans-serif] transition-all cursor-pointer ${tab==='timeline'?'bg-white text-[var(--dark)] shadow-sm':'text-[var(--text-muted)]'}`}>Timeline ({activities.length + transitions.length})</button>
      </div>

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
              <p className="text-[9px] font-bold text-[var(--primary)] uppercase tracking-wider font-[Space_Grotesk,sans-serif] mb-2">Sesión web</p>
              <div className="grid grid-cols-2 gap-2"><InfoChip label="Dispositivo" value={sessionInfo.device_type||'N/A'} />{sessionInfo.utm_source&&<InfoChip label="Fuente" value={sessionInfo.utm_source}/>}<InfoChip label="Visita" value={new Date(sessionInfo.first_seen_at).toLocaleString('es-VE')}/></div>
            </div>
          )}
          <BtnPrimary onClick={()=>onSave({...form,amount_quoted:form.amount_quoted?parseFloat(form.amount_quoted):null,amount_paid:form.amount_paid?parseFloat(form.amount_paid):null,plan_interested:form.plan_interested||null})}>Guardar cambios</BtnPrimary>
          <div className="pt-3 border-t border-[var(--border-light)]">
            {!confirmDelete ? <button onClick={()=>setConfirmDelete(true)} className="w-full py-2 text-xs text-red-400 hover:text-red-600 cursor-pointer font-[Space_Grotesk,sans-serif]">Eliminar lead</button>
            : <div className="flex gap-2 animate-fade-in"><button onClick={onDelete} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 cursor-pointer active:scale-[0.98]">Confirmar</button><button onClick={()=>setConfirmDelete(false)} className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-secondary)] cursor-pointer">Cancelar</button></div>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick note */}
          <div className="flex gap-2">
            <select value={noteType} onChange={e=>setNoteType(e.target.value)} className="px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm w-16">{Object.entries(ACTIVITY_ICONS).filter(([k])=>!['stage_change','system'].includes(k)).map(([v,i])=><option key={v} value={v}>{i}</option>)}</select>
            <input type="text" value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Agregar nota rápida..." onKeyDown={e=>{if(e.key==='Enter')addNote()}}
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] placeholder:text-[var(--text-muted)]" />
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
                  {item.type === 'transition' ? '🔄' : ACTIVITY_ICONS[(item.data as Activity).activity_type] || '📝'}
                </div>
                <div className="flex-1 min-w-0">
                  {item.type === 'transition' ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--dark)]">{stages.find(s=>s.slug===(item.data as Transition).from_stage)?.label || 'Inicio'}</span>
                      {' → '}
                      <span className="font-semibold text-[var(--primary)]">{stages.find(s=>s.slug===(item.data as Transition).to_stage)?.label}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--dark)]">{(item.data as Activity).content}</p>
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
function Modal({title,icon,onClose,children}:{title:string;icon?:string;onClose:()=>void;children:React.ReactNode}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl animate-fade-in-scale border border-[var(--border-light)]" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)] flex-shrink-0">
          <div className="flex items-center gap-2.5">{icon&&<span className="text-xl">{icon}</span>}<h2 className="font-bold text-lg text-[var(--dark)] font-[Space_Grotesk,sans-serif]">{title}</h2></div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--dark)] cursor-pointer p-1.5 rounded-lg hover:bg-[var(--bg-alt)]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
function Input({label,value,onChange,type='text',autoFocus}:{label:string;value:string;onChange:(v:string)=>void;type?:string;autoFocus?:boolean}) { return <div><label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} autoFocus={autoFocus} className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all"/></div> }
function Textarea({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) { return <div><label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label><textarea value={value} onChange={e=>onChange(e.target.value)} rows={2} className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all resize-none"/></div> }
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}) { return <div><label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label><select value={value} onChange={e=>onChange(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all">{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div> }
function BtnPrimary({onClick,children}:{onClick:()=>void;children:React.ReactNode}) { return <button onClick={onClick} className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[Space_Grotesk,sans-serif] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.98]">{children}</button> }
function InfoChip({label,value}:{label:string;value:string}) { return <div className="bg-white rounded-lg px-2.5 py-1.5 border border-[var(--border-light)]"><p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{label}</p><p className="text-xs font-semibold text-[var(--dark)] truncate">{value}</p></div> }
