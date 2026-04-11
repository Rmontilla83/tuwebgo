'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Lead = {
  id: string; name: string | null; phone: string | null; business_name: string | null
  source_channel: string; current_stage: string; plan_interested: string | null
  amount_quoted: number | null; amount_paid: number | null; notes: string | null
  ref_code: string | null; created_at: string
}

type Stage = { slug: string; label: string; sort_order: number; is_won: boolean; is_lost: boolean }

const STAGE_THEME: Record<string, { border: string; dot: string; bg: string; tabActive: string }> = {
  nuevo:              { border: 'border-t-blue-400',    dot: 'bg-blue-400',    bg: 'bg-blue-50/60',     tabActive: 'bg-blue-500 text-white' },
  contactado:         { border: 'border-t-amber-400',   dot: 'bg-amber-400',   bg: 'bg-amber-50/60',    tabActive: 'bg-amber-500 text-white' },
  pre_diseno_enviado: { border: 'border-t-purple-400',  dot: 'bg-purple-400',  bg: 'bg-purple-50/60',   tabActive: 'bg-purple-500 text-white' },
  aprobado:           { border: 'border-t-indigo-400',  dot: 'bg-indigo-400',  bg: 'bg-indigo-50/60',   tabActive: 'bg-indigo-500 text-white' },
  pagado:             { border: 'border-t-emerald-500', dot: 'bg-emerald-500', bg: 'bg-emerald-50/60',  tabActive: 'bg-emerald-500 text-white' },
  entregado:          { border: 'border-t-teal-500',    dot: 'bg-teal-500',    bg: 'bg-teal-50/60',     tabActive: 'bg-teal-500 text-white' },
}

const PLAN_LABELS: Record<string, string> = { pre_diseno: 'Pre-diseño', landing_page: 'Landing', sitio_web: 'Sitio Web' }
const SOURCE_LABELS: Record<string, string> = {
  landing_page: 'Landing', instagram_dm: 'Instagram', referral: 'Referido',
  meta_ads_direct: 'Meta Ads', organic_wa: 'WhatsApp', other: 'Otro',
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

  const fetchData = useCallback(async () => {
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('sort_order'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ])
    setStages(s || []); setLeads(l || []); setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // Track scroll position for fade indicators
  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollIndicators()
    el.addEventListener('scroll', updateScrollIndicators, { passive: true })
    const ro = new ResizeObserver(updateScrollIndicators)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollIndicators); ro.disconnect() }
  }, [loading, updateScrollIndicators])

  function scrollBoard(direction: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' })
  }

  async function moveToStage(leadId: string, newStage: string) {
    const updates: Record<string, unknown> = { current_stage: newStage }
    const stage = stages.find(s => s.slug === newStage)
    if (stage?.is_won || stage?.is_lost) updates.closed_at = new Date().toISOString()
    await supabase.from('leads').update(updates).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, current_stage: newStage } : l))
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div></div>
  }

  const visibleStages = stages.filter(s => !s.is_lost)
  const totalValue = leads.filter(l => l.current_stage !== 'perdido').reduce((s, l) => s + (l.amount_quoted || 0), 0)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">Pipeline</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm text-[var(--text-secondary)]">{leads.length} leads</p>
            {totalValue > 0 && <p className="text-sm text-[var(--text-secondary)]">· Valor: <span className="font-semibold text-[var(--dark)]">${totalValue}</span></p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLinkRef(true)}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[var(--green)] text-white text-xs sm:text-sm font-semibold font-[Space_Grotesk,sans-serif] hover:brightness-110 transition-all cursor-pointer shadow-md shadow-emerald-500/20 active:scale-[0.97]">
            <span className="flex items-center gap-1.5 sm:gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              <span className="hidden sm:inline">Vincular</span> ref code
            </span>
          </button>
          <button onClick={() => setShowNewLead(true)}
            className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs sm:text-sm font-semibold font-[Space_Grotesk,sans-serif] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.97]">
            + Nuevo lead
          </button>
        </div>
      </div>

      {/* ── MOBILE: Tab view ── */}
      <div className="md:hidden">
        {/* Stage tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
          {visibleStages.map((stage) => {
            const count = leads.filter(l => l.current_stage === stage.slug).length
            const theme = STAGE_THEME[stage.slug]
            const active = mobileTab === stage.slug
            return (
              <button key={stage.slug} onClick={() => setMobileTab(stage.slug)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold font-[Space_Grotesk,sans-serif] transition-all cursor-pointer ${
                  active ? theme?.tabActive || 'bg-[var(--primary)] text-white' : 'bg-white text-[var(--text-secondary)] border border-[var(--border)]'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white/70' : theme?.dot || 'bg-gray-400'}`}></span>
                {stage.label}
                <span className={`ml-0.5 px-1.5 py-0 rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-[var(--bg-alt)]'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Cards for selected stage */}
        <div className="space-y-2.5 mt-1">
          {leads.filter(l => l.current_stage === mobileTab).map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={() => setEditLead(lead)} />
          ))}
          {leads.filter(l => l.current_stage === mobileTab).length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-[var(--border)]">
              <p className="text-sm text-[var(--text-muted)]">Sin leads en esta etapa</p>
            </div>
          )}
        </div>

        {/* Mobile stage move buttons */}
        {editLead && null /* handled by modal */}
      </div>

      {/* ── DESKTOP: Kanban board ── */}
      <div className="hidden md:block relative">
        {/* Scroll indicators */}
        {canScrollLeft && (
          <button onClick={() => scrollBoard('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 border border-[var(--border)] shadow-lg flex items-center justify-center cursor-pointer hover:bg-white transition-all -ml-3">
            <svg className="w-5 h-5 text-[var(--dark)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
        )}
        {canScrollRight && (
          <button onClick={() => scrollBoard('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 border border-[var(--border)] shadow-lg flex items-center justify-center cursor-pointer hover:bg-white transition-all -mr-3">
            <svg className="w-5 h-5 text-[var(--dark)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        {/* Fade edges */}
        {canScrollLeft && <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[var(--bg)] to-transparent z-10 pointer-events-none rounded-l-2xl"></div>}
        {canScrollRight && <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[var(--bg)] to-transparent z-10 pointer-events-none rounded-r-2xl"></div>}

        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-3 scroll-smooth" style={{ scrollbarWidth: 'thin' }}>
          {visibleStages.map((stage) => {
            const stageLeads = leads.filter(l => l.current_stage === stage.slug)
            const theme = STAGE_THEME[stage.slug] || { border: 'border-t-gray-400', dot: 'bg-gray-400', bg: 'bg-gray-400/5' }
            const isDragTarget = dragOver === stage.slug

            return (
              <div
                key={stage.slug}
                className={`flex-shrink-0 rounded-2xl border border-[var(--border)] transition-all duration-200 ${theme.bg} ${isDragTarget ? 'ring-2 ring-[var(--primary)] ring-offset-2 scale-[1.01]' : ''}`}
                style={{ width: 'clamp(220px, calc((100% - 60px) / 6), 300px)', minWidth: '220px' }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(stage.slug) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => { if (draggedLead) { moveToStage(draggedLead, stage.slug); setDraggedLead(null); setDragOver(null) } }}
              >
                {/* Column header */}
                <div className={`p-3 lg:p-4 border-t-[3px] rounded-t-2xl ${theme.border}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.dot} animate-pulse-soft`}></span>
                      <h3 className="font-bold text-[12px] lg:text-[13px] text-[var(--dark)] font-[Space_Grotesk,sans-serif] truncate">{stage.label}</h3>
                    </div>
                    <span className="text-[10px] lg:text-[11px] font-bold text-[var(--text-muted)] bg-white/80 px-1.5 lg:px-2 py-0.5 rounded-full border border-[var(--border-light)] flex-shrink-0 ml-1">{stageLeads.length}</span>
                  </div>
                </div>

                {/* Cards */}
                <div className="p-2 lg:p-2.5 space-y-2 max-h-[calc(100vh-240px)] overflow-y-auto">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDraggedLead(lead.id)}
                      onDragEnd={() => { setDraggedLead(null); setDragOver(null) }}
                      onClick={() => setEditLead(lead)}
                      className={`bg-white rounded-xl p-3 border border-[var(--border-light)] shadow-sm hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing active:scale-[0.97] active:shadow-lg group ${draggedLead === lead.id ? 'opacity-30 scale-95' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-semibold text-[13px] text-[var(--dark)] leading-snug truncate">{lead.name || 'Sin nombre'}</p>
                        <svg className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </div>
                      {lead.business_name && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">{lead.business_name}</p>}
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {lead.plan_interested && (
                          <span className="text-[9px] lg:text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--bg-alt)] text-[var(--primary)] border border-[var(--border-light)]">
                            {PLAN_LABELS[lead.plan_interested] || lead.plan_interested}
                          </span>
                        )}
                        {lead.amount_paid ? (
                          <span className="text-[9px] lg:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">${lead.amount_paid}</span>
                        ) : lead.amount_quoted ? (
                          <span className="text-[9px] lg:text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">~${lead.amount_quoted}</span>
                        ) : null}
                      </div>
                      {lead.ref_code && <p className="text-[8px] lg:text-[9px] text-[var(--text-muted)] mt-1.5 font-mono tracking-wider opacity-50">{lead.ref_code}</p>}
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className={`text-center py-8 rounded-xl border-2 border-dashed border-[var(--border-light)] ${isDragTarget ? 'bg-[var(--primary-glow)] border-[var(--primary)]' : ''} transition-all`}>
                      <p className="text-[11px] text-[var(--text-muted)]">{isDragTarget ? 'Soltar aquí' : 'Vacío'}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modals */}
      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} onSave={async (data) => { await supabase.from('leads').insert(data); setShowNewLead(false); fetchData() }} />}
      {showLinkRef && <LinkRefModal supabase={supabase} onClose={() => setShowLinkRef(false)} onLinked={() => { setShowLinkRef(false); fetchData() }} />}
      {editLead && <EditLeadModal lead={editLead} stages={stages} supabase={supabase} onClose={() => setEditLead(null)} onSave={async (data) => { await supabase.from('leads').update(data).eq('id', editLead.id); setEditLead(null); fetchData() }} />}
    </div>
  )
}

// ── Lead Card (mobile) ──
function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="bg-white rounded-xl p-4 border border-[var(--border-light)] shadow-sm active:scale-[0.98] transition-all cursor-pointer">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-[var(--dark)]">{lead.name || 'Sin nombre'}</p>
          {lead.business_name && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{lead.business_name}</p>}
        </div>
        <svg className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </div>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {lead.plan_interested && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-alt)] text-[var(--primary)] border border-[var(--border-light)]">
            {PLAN_LABELS[lead.plan_interested] || lead.plan_interested}
          </span>
        )}
        {lead.amount_paid ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">${lead.amount_paid}</span>
        ) : lead.amount_quoted ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">~${lead.amount_quoted}</span>
        ) : null}
        {lead.ref_code && <span className="text-[9px] text-[var(--text-muted)] font-mono">{lead.ref_code}</span>}
      </div>
    </div>
  )
}

// ── New Lead Modal ──
function NewLeadModal({ onClose, onSave }: { onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({ name: '', phone: '', business_name: '', source_channel: 'landing_page', plan_interested: '', notes: '' })
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  return (
    <Modal title="Nuevo Lead" icon="👤" onClose={onClose}>
      <div className="space-y-4">
        <Input label="Nombre" value={form.name} onChange={v => set('name', v)} autoFocus />
        <Input label="Teléfono" value={form.phone} onChange={v => set('phone', v)} />
        <Input label="Negocio" value={form.business_name} onChange={v => set('business_name', v)} />
        <Select label="Canal de origen" value={form.source_channel} onChange={v => set('source_channel', v)} options={Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        <Select label="Plan interesado" value={form.plan_interested} onChange={v => set('plan_interested', v)} options={[
          { value: '', label: 'Sin definir' }, ...Object.entries(PLAN_LABELS).map(([v, l]) => ({ value: v, label: l })),
        ]} />
        <Textarea label="Notas" value={form.notes} onChange={v => set('notes', v)} />
        <BtnPrimary onClick={() => onSave({ ...form, plan_interested: form.plan_interested || null, notes: form.notes || null })}>Crear lead</BtnPrimary>
      </div>
    </Modal>
  )
}

// ── Link Ref Code Modal ──
function LinkRefModal({ supabase, onClose, onLinked }: { supabase: ReturnType<typeof createClient>; onClose: () => void; onLinked: () => void }) {
  const [refCode, setRefCode] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionData, setSessionData] = useState<Record<string, string> | null>(null)

  async function handleLink() {
    setLoading(true); setResult(null)
    const code = refCode.trim()
    const { data: session } = await supabase.from('sessions').select('*').eq('ref_code', code).single()
    if (!session) {
      const { data: s2 } = await supabase.from('sessions').select('*').eq('ref_code', code.toUpperCase()).single()
      if (!s2) { setResult('No se encontró sesión con ese código'); setLoading(false); return }
      setSessionData(s2)
    } else { setSessionData(session) }
    setLoading(false)
  }

  async function createFromSession() {
    if (!sessionData) return
    const { data: ctaEvents } = await supabase.from('events').select('event_data').eq('session_id', sessionData.id).eq('event_type', 'cta_click').order('created_at', { ascending: false }).limit(1)
    const plan = (ctaEvents?.[0]?.event_data as Record<string, string>)?.plan || null
    let source_channel = 'landing_page'
    if (['facebook', 'instagram', 'meta'].includes(sessionData.utm_source)) source_channel = 'meta_ads_direct'
    const { data: lead } = await supabase.from('leads').insert({ ref_code: sessionData.ref_code, source_channel, plan_interested: plan && plan !== 'generic' ? plan : null }).select().single()
    if (lead) {
      await supabase.from('sessions').update({ lead_id: lead.id }).eq('id', sessionData.id)
      setResult('Lead creado y vinculado')
      setTimeout(onLinked, 1200)
    }
  }

  return (
    <Modal title="Vincular ref code" icon="🔗" onClose={onClose}>
      <p className="text-sm text-[var(--text-secondary)] mb-4">Ingresa el código <code className="bg-[var(--bg-alt)] px-1.5 py-0.5 rounded text-[var(--primary)] font-mono font-bold text-xs">[ref:TW-xxxx]</code> del mensaje de WhatsApp</p>
      <div className="flex gap-2 mb-5">
        <input type="text" value={refCode} onChange={e => setRefCode(e.target.value)} placeholder="TW-a3f2"
          className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--dark)] text-sm font-mono font-bold tracking-wider placeholder:text-[var(--text-muted)] placeholder:font-normal transition-all" autoFocus />
        <button onClick={handleLink} disabled={loading || !refCode.trim()}
          className="px-5 sm:px-6 py-3 rounded-xl bg-[var(--green)] text-white font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-40 cursor-pointer active:scale-[0.97]">
          {loading ? '...' : 'Buscar'}
        </button>
      </div>
      {sessionData && !result && (
        <div className="bg-[var(--bg-alt)] rounded-xl p-4 mb-4 border border-[var(--border-light)] animate-fade-in-scale">
          <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider font-[Space_Grotesk,sans-serif] mb-3">Sesión encontrada</p>
          <div className="grid grid-cols-2 gap-2 text-xs mb-4">
            <InfoChip label="Dispositivo" value={sessionData.device_type || 'N/A'} />
            {sessionData.utm_source && <InfoChip label="UTM Source" value={sessionData.utm_source} />}
            {sessionData.utm_campaign && <InfoChip label="Campaña" value={sessionData.utm_campaign} />}
            <InfoChip label="Fecha" value={new Date(sessionData.first_seen_at).toLocaleString('es-VE')} />
          </div>
          <BtnPrimary onClick={createFromSession}>Crear lead desde esta sesión</BtnPrimary>
        </div>
      )}
      {result && <p className={`text-sm text-center py-3 font-semibold animate-fade-in ${result.includes('No se') ? 'text-red-500' : 'text-emerald-600'}`}>{result}</p>}
    </Modal>
  )
}

// ── Edit Lead Modal ──
function EditLeadModal({ lead, stages, supabase, onClose, onSave }: {
  lead: Lead; stages: Stage[]; supabase: ReturnType<typeof createClient>
  onClose: () => void; onSave: (data: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState({
    name: lead.name || '', phone: lead.phone || '', business_name: lead.business_name || '',
    current_stage: lead.current_stage, plan_interested: lead.plan_interested || '',
    amount_quoted: lead.amount_quoted?.toString() || '', amount_paid: lead.amount_paid?.toString() || '',
    notes: lead.notes || '',
  })
  const [sessionInfo, setSessionInfo] = useState<Record<string, string> | null>(null)
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (lead.ref_code) {
      supabase.from('sessions').select('*').eq('ref_code', lead.ref_code).single()
        .then(({ data }) => { if (data) setSessionInfo(data) })
    }
  }, [lead.ref_code, supabase])

  return (
    <Modal title="Detalle del lead" icon="📋" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre" value={form.name} onChange={v => set('name', v)} />
          <Input label="Teléfono" value={form.phone} onChange={v => set('phone', v)} />
        </div>
        <Input label="Negocio" value={form.business_name} onChange={v => set('business_name', v)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Etapa" value={form.current_stage} onChange={v => set('current_stage', v)} options={stages.map(s => ({ value: s.slug, label: s.label }))} />
          <Select label="Plan" value={form.plan_interested} onChange={v => set('plan_interested', v)} options={[{ value: '', label: 'Sin definir' }, ...Object.entries(PLAN_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Cotizado ($)" value={form.amount_quoted} onChange={v => set('amount_quoted', v)} type="number" />
          <Input label="Pagado ($)" value={form.amount_paid} onChange={v => set('amount_paid', v)} type="number" />
        </div>
        <Textarea label="Notas" value={form.notes} onChange={v => set('notes', v)} />
        {sessionInfo && (
          <div className="bg-gradient-to-br from-[var(--bg-alt)] to-[var(--bg)] rounded-xl p-4 border border-[var(--border-light)]">
            <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider font-[Space_Grotesk,sans-serif] mb-2.5">Datos de sesión</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <InfoChip label="Dispositivo" value={sessionInfo.device_type || 'N/A'} />
              {sessionInfo.utm_source && <InfoChip label="Fuente" value={sessionInfo.utm_source} />}
              {sessionInfo.utm_campaign && <InfoChip label="Campaña" value={sessionInfo.utm_campaign} />}
              <InfoChip label="Visita" value={new Date(sessionInfo.first_seen_at).toLocaleString('es-VE')} />
            </div>
          </div>
        )}
        <BtnPrimary onClick={() => onSave({
          ...form,
          amount_quoted: form.amount_quoted ? parseFloat(form.amount_quoted) : null,
          amount_paid: form.amount_paid ? parseFloat(form.amount_paid) : null,
          plan_interested: form.plan_interested || null, notes: form.notes || null,
        })}>Guardar cambios</BtnPrimary>
      </div>
    </Modal>
  )
}

// ── Shared UI ──
function Modal({ title, icon, onClose, children }: { title: string; icon?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50" onClick={onClose}>
      <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-6">
        <div className="bg-white w-full sm:rounded-2xl sm:max-w-md rounded-t-2xl shadow-2xl animate-fade-in-scale border-0 sm:border border-[var(--border-light)] relative"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-xl">{icon}</span>}
            <h2 className="font-bold text-lg text-[var(--dark)] font-[Space_Grotesk,sans-serif]">{title}</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--dark)] transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-[var(--bg-alt)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 sm:p-5 max-h-[70vh] sm:max-h-[75vh] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', autoFocus }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus}
        className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all duration-200" />
    </div>
  )
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
        className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all duration-200 resize-none" />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all duration-200">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function BtnPrimary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[Space_Grotesk,sans-serif] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.98]">
      {children}
    </button>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg px-2.5 py-1.5 border border-[var(--border-light)]">
      <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
      <p className="text-xs font-semibold text-[var(--dark)] truncate">{value}</p>
    </div>
  )
}
