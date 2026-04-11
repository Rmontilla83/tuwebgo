'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Lead = {
  id: string
  name: string | null
  phone: string | null
  business_name: string | null
  source_channel: string
  current_stage: string
  plan_interested: string | null
  amount_quoted: number | null
  amount_paid: number | null
  notes: string | null
  ref_code: string | null
  created_at: string
}

type Stage = {
  slug: string
  label: string
  sort_order: number
  is_won: boolean
  is_lost: boolean
}

const STAGE_COLORS: Record<string, string> = {
  nuevo: 'border-t-blue-400',
  contactado: 'border-t-yellow-400',
  pre_diseno_enviado: 'border-t-purple-400',
  aprobado: 'border-t-indigo-400',
  pagado: 'border-t-green-400',
  entregado: 'border-t-emerald-400',
  perdido: 'border-t-red-400',
}

const STAGE_DOT: Record<string, string> = {
  nuevo: 'bg-blue-400',
  contactado: 'bg-yellow-400',
  pre_diseno_enviado: 'bg-purple-400',
  aprobado: 'bg-indigo-400',
  pagado: 'bg-green-400',
  entregado: 'bg-emerald-400',
  perdido: 'bg-red-400',
}

export default function PipelinePage() {
  const supabase = createClient()
  const [stages, setStages] = useState<Stage[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewLead, setShowNewLead] = useState(false)
  const [showLinkRef, setShowLinkRef] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [draggedLead, setDraggedLead] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [{ data: stagesData }, { data: leadsData }] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('sort_order'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ])
    setStages(stagesData || [])
    setLeads(leadsData || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  async function moveToStage(leadId: string, newStage: string) {
    const updates: Record<string, unknown> = { current_stage: newStage }
    const stage = stages.find(s => s.slug === newStage)
    if (stage?.is_won || stage?.is_lost) {
      updates.closed_at = new Date().toISOString()
    }
    await supabase.from('leads').update(updates).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, current_stage: newStage } : l))
  }

  function handleDragStart(leadId: string) {
    setDraggedLead(leadId)
  }

  function handleDrop(stageSlug: string) {
    if (draggedLead) {
      moveToStage(draggedLead, stageSlug)
      setDraggedLead(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-[#94A3B8]">Cargando pipeline...</p></div>
  }

  const visibleStages = stages.filter(s => !s.is_lost)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E1B4B]">Pipeline</h1>
          <p className="text-sm text-[#64748B] mt-1">{leads.length} leads en total</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLinkRef(true)}
            className="px-4 py-2 rounded-xl bg-[#059669] text-white text-sm font-semibold hover:bg-[#047857] transition-all cursor-pointer"
          >
            Vincular ref code
          </button>
          <button
            onClick={() => setShowNewLead(true)}
            className="px-4 py-2 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#6366F1] transition-all cursor-pointer"
          >
            + Nuevo lead
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[60vh]">
        {visibleStages.map((stage) => {
          const stageLeads = leads.filter(l => l.current_stage === stage.slug)
          return (
            <div
              key={stage.slug}
              className="flex-shrink-0 w-72 bg-[#FAFAFE] rounded-2xl border border-[#E0DEF7]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.slug)}
            >
              <div className={`p-4 border-t-4 rounded-t-2xl ${STAGE_COLORS[stage.slug]}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STAGE_DOT[stage.slug]}`}></span>
                    <h3 className="font-bold text-sm text-[#1E1B4B]">{stage.label}</h3>
                  </div>
                  <span className="text-xs font-bold text-[#94A3B8] bg-white px-2 py-0.5 rounded-full">{stageLeads.length}</span>
                </div>
              </div>

              <div className="p-3 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => handleDragStart(lead.id)}
                    onClick={() => setEditLead(lead)}
                    className="bg-white rounded-xl p-3 border border-[#E0DEF7] shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
                  >
                    <p className="font-semibold text-sm text-[#1E1B4B]">{lead.name || 'Sin nombre'}</p>
                    {lead.business_name && <p className="text-xs text-[#64748B] mt-0.5">{lead.business_name}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      {lead.plan_interested && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F1F0FB] text-[#4F46E5]">
                          {lead.plan_interested === 'pre_diseno' ? 'Pre-diseño' : lead.plan_interested === 'landing_page' ? 'Landing' : 'Sitio Web'}
                        </span>
                      )}
                      {lead.amount_paid && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                          ${lead.amount_paid}
                        </span>
                      )}
                    </div>
                    {lead.ref_code && (
                      <p className="text-[10px] text-[#94A3B8] mt-1.5 font-mono">{lead.ref_code}</p>
                    )}
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <p className="text-xs text-[#94A3B8] text-center py-6">Sin leads</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* New Lead Modal */}
      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onSave={async (data) => {
            await supabase.from('leads').insert(data)
            setShowNewLead(false)
            fetchData()
          }}
        />
      )}

      {/* Link Ref Code Modal */}
      {showLinkRef && (
        <LinkRefModal
          supabase={supabase}
          onClose={() => setShowLinkRef(false)}
          onLinked={() => { setShowLinkRef(false); fetchData() }}
        />
      )}

      {/* Edit Lead Modal */}
      {editLead && (
        <EditLeadModal
          lead={editLead}
          stages={stages}
          supabase={supabase}
          onClose={() => setEditLead(null)}
          onSave={async (data) => {
            await supabase.from('leads').update(data).eq('id', editLead.id)
            setEditLead(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// ── New Lead Modal ──────────────────────────────────
function NewLeadModal({ onClose, onSave }: { onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    name: '', phone: '', business_name: '', source_channel: 'landing_page',
    plan_interested: '', notes: '',
  })

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  return (
    <Modal title="Nuevo Lead" onClose={onClose}>
      <div className="space-y-4">
        <Input label="Nombre" value={form.name} onChange={v => set('name', v)} />
        <Input label="Teléfono" value={form.phone} onChange={v => set('phone', v)} />
        <Input label="Negocio" value={form.business_name} onChange={v => set('business_name', v)} />
        <Select label="Canal" value={form.source_channel} onChange={v => set('source_channel', v)} options={[
          { value: 'landing_page', label: 'Landing Page' },
          { value: 'instagram_dm', label: 'Instagram DM' },
          { value: 'referral', label: 'Referido' },
          { value: 'organic_wa', label: 'WhatsApp directo' },
          { value: 'meta_ads_direct', label: 'Meta Ads' },
          { value: 'other', label: 'Otro' },
        ]} />
        <Select label="Plan interesado" value={form.plan_interested} onChange={v => set('plan_interested', v)} options={[
          { value: '', label: 'Sin definir' },
          { value: 'pre_diseno', label: 'Pre-diseño ($50)' },
          { value: 'landing_page', label: 'Landing Page ($150)' },
          { value: 'sitio_web', label: 'Sitio Web ($250)' },
        ]} />
        <Textarea label="Notas" value={form.notes} onChange={v => set('notes', v)} />
        <button onClick={() => onSave(form)} className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white font-semibold text-sm hover:bg-[#6366F1] transition-all cursor-pointer">
          Crear lead
        </button>
      </div>
    </Modal>
  )
}

// ── Link Ref Code Modal ─────────────────────────────
function LinkRefModal({ supabase, onClose, onLinked }: { supabase: ReturnType<typeof createClient>; onClose: () => void; onLinked: () => void }) {
  const [refCode, setRefCode] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sessionData, setSessionData] = useState<Record<string, string> | null>(null)

  async function handleLink() {
    setLoading(true)
    setResult(null)

    const code = refCode.trim().toUpperCase()
    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('ref_code', code)
      .single()

    if (!session) {
      // Try lowercase
      const { data: session2 } = await supabase
        .from('sessions')
        .select('*')
        .eq('ref_code', refCode.trim())
        .single()

      if (!session2) {
        setResult('No se encontró ninguna sesión con ese código')
        setLoading(false)
        return
      }
      setSessionData(session2)
    } else {
      setSessionData(session)
    }
    setLoading(false)
  }

  async function createFromSession() {
    if (!sessionData) return

    // Determine plan from CTA click events
    const { data: ctaEvents } = await supabase
      .from('events')
      .select('event_data')
      .eq('session_id', sessionData.id)
      .eq('event_type', 'cta_click')
      .order('created_at', { ascending: false })
      .limit(1)

    const plan = ctaEvents?.[0]?.event_data?.plan || null

    // Determine source channel from UTMs
    let source_channel = 'landing_page'
    if (sessionData.utm_source === 'facebook' || sessionData.utm_source === 'instagram' || sessionData.utm_source === 'meta') {
      source_channel = 'meta_ads_direct'
    }

    const leadData = {
      ref_code: sessionData.ref_code,
      source_channel,
      plan_interested: plan && plan !== 'generic' ? plan : null,
    }

    const { data: lead } = await supabase.from('leads').insert(leadData).select().single()

    if (lead) {
      await supabase.from('sessions').update({ lead_id: lead.id }).eq('id', sessionData.id)
      setResult(`Lead creado y vinculado. Fuente: ${source_channel}${plan ? ', Plan: ' + plan : ''}`)
      setTimeout(onLinked, 1500)
    }
  }

  return (
    <Modal title="Vincular ref code" onClose={onClose}>
      <p className="text-sm text-[#64748B] mb-4">
        Ingresa el código <span className="font-mono font-bold">[ref:TW-xxxx]</span> del mensaje de WhatsApp
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={refCode}
          onChange={e => setRefCode(e.target.value)}
          placeholder="TW-a3f2"
          className="flex-1 px-4 py-2.5 rounded-xl border border-[#E0DEF7] bg-[#FAFAFE] text-[#1E1B4B] text-sm font-mono focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
        />
        <button
          onClick={handleLink}
          disabled={loading || !refCode.trim()}
          className="px-5 py-2.5 rounded-xl bg-[#059669] text-white font-semibold text-sm hover:bg-[#047857] transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? '...' : 'Buscar'}
        </button>
      </div>

      {sessionData && !result && (
        <div className="bg-[#F1F0FB] rounded-xl p-4 mb-4 space-y-2">
          <p className="text-sm font-semibold text-[#1E1B4B]">Sesión encontrada:</p>
          <div className="text-xs text-[#64748B] space-y-1">
            <p>Dispositivo: <strong className="text-[#1E1B4B]">{sessionData.device_type || 'desconocido'}</strong></p>
            {sessionData.utm_source && <p>UTM Source: <strong className="text-[#1E1B4B]">{sessionData.utm_source}</strong></p>}
            {sessionData.utm_campaign && <p>Campaña: <strong className="text-[#1E1B4B]">{sessionData.utm_campaign}</strong></p>}
            {sessionData.referrer && <p>Referrer: <strong className="text-[#1E1B4B]">{sessionData.referrer}</strong></p>}
            <p>Fecha: <strong className="text-[#1E1B4B]">{new Date(sessionData.first_seen_at).toLocaleString('es-VE')}</strong></p>
          </div>
          <button
            onClick={createFromSession}
            className="w-full mt-3 py-2 rounded-xl bg-[#4F46E5] text-white font-semibold text-sm hover:bg-[#6366F1] transition-all cursor-pointer"
          >
            Crear lead desde esta sesión
          </button>
        </div>
      )}

      {result && (
        <p className={`text-sm text-center py-2 ${result.includes('No se') ? 'text-red-500' : 'text-green-600'}`}>{result}</p>
      )}
    </Modal>
  )
}

// ── Edit Lead Modal ─────────────────────────────────
function EditLeadModal({ lead, stages, supabase, onClose, onSave }: {
  lead: Lead; stages: Stage[]; supabase: ReturnType<typeof createClient>;
  onClose: () => void; onSave: (data: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState({
    name: lead.name || '',
    phone: lead.phone || '',
    business_name: lead.business_name || '',
    current_stage: lead.current_stage,
    plan_interested: lead.plan_interested || '',
    amount_quoted: lead.amount_quoted?.toString() || '',
    amount_paid: lead.amount_paid?.toString() || '',
    notes: lead.notes || '',
  })
  const [sessionInfo, setSessionInfo] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    if (lead.ref_code) {
      supabase.from('sessions').select('*').eq('ref_code', lead.ref_code).single()
        .then(({ data }) => { if (data) setSessionInfo(data) })
    }
  }, [lead.ref_code, supabase])

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  return (
    <Modal title="Detalle del lead" onClose={onClose}>
      <div className="space-y-4">
        <Input label="Nombre" value={form.name} onChange={v => set('name', v)} />
        <Input label="Teléfono" value={form.phone} onChange={v => set('phone', v)} />
        <Input label="Negocio" value={form.business_name} onChange={v => set('business_name', v)} />
        <Select label="Etapa" value={form.current_stage} onChange={v => set('current_stage', v)}
          options={stages.map(s => ({ value: s.slug, label: s.label }))}
        />
        <Select label="Plan" value={form.plan_interested} onChange={v => set('plan_interested', v)} options={[
          { value: '', label: 'Sin definir' },
          { value: 'pre_diseno', label: 'Pre-diseño' },
          { value: 'landing_page', label: 'Landing Page' },
          { value: 'sitio_web', label: 'Sitio Web' },
        ]} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Monto cotizado ($)" value={form.amount_quoted} onChange={v => set('amount_quoted', v)} type="number" />
          <Input label="Monto pagado ($)" value={form.amount_paid} onChange={v => set('amount_paid', v)} type="number" />
        </div>
        <Textarea label="Notas" value={form.notes} onChange={v => set('notes', v)} />

        {sessionInfo && (
          <div className="bg-[#F1F0FB] rounded-xl p-3">
            <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider mb-2">Info de sesión</p>
            <div className="text-xs text-[#64748B] space-y-1">
              <p>Dispositivo: {sessionInfo.device_type}</p>
              {sessionInfo.utm_source && <p>Fuente: {sessionInfo.utm_source}</p>}
              {sessionInfo.utm_campaign && <p>Campaña: {sessionInfo.utm_campaign}</p>}
              <p>Fecha visita: {new Date(sessionInfo.first_seen_at).toLocaleString('es-VE')}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => onSave({
            ...form,
            amount_quoted: form.amount_quoted ? parseFloat(form.amount_quoted) : null,
            amount_paid: form.amount_paid ? parseFloat(form.amount_paid) : null,
            plan_interested: form.plan_interested || null,
          })}
          className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white font-semibold text-sm hover:bg-[#6366F1] transition-all cursor-pointer"
        >
          Guardar cambios
        </button>
      </div>
    </Modal>
  )
}

// ── Shared UI Components ────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#E0DEF7]">
          <h2 className="font-bold text-lg text-[#1E1B4B]">{title}</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E1B4B] transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-[#E0DEF7] bg-[#FAFAFE] text-sm text-[#1E1B4B] focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15" />
    </div>
  )
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3}
        className="w-full px-3 py-2 rounded-xl border border-[#E0DEF7] bg-[#FAFAFE] text-sm text-[#1E1B4B] focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 resize-none" />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-[#E0DEF7] bg-[#FAFAFE] text-sm text-[#1E1B4B] focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
