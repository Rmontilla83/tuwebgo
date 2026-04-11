'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Campaign = {
  id: string
  name: string
  platform: string
  utm_campaign: string | null
  start_date: string
  end_date: string | null
  status: string
  notes: string | null
  created_at: string
}

type Expense = {
  id: string
  campaign_id: string
  amount: number
  expense_date: string
  description: string | null
}

type CampaignMetrics = {
  total_spend: number
  total_leads: number
  won_leads: number
  revenue: number
  cpl: number
  cac: number
  roi: number
}

const PLATFORM_LABELS: Record<string, string> = {
  meta_ads: 'Meta Ads',
  instagram_organic: 'Instagram Orgánico',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  referral_program: 'Referidos',
  other: 'Otro',
}

const PLATFORM_COLORS: Record<string, string> = {
  meta_ads: 'bg-blue-100 text-blue-700',
  instagram_organic: 'bg-pink-100 text-pink-700',
  google_ads: 'bg-yellow-100 text-yellow-700',
  tiktok_ads: 'bg-slate-100 text-slate-700',
  referral_program: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-700',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  paused: 'Pausada',
  ended: 'Finalizada',
}

export default function CampaignsPage() {
  const supabase = createClient()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [metrics, setMetrics] = useState<Record<string, CampaignMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showExpense, setShowExpense] = useState<string | null>(null)
  const [showUtm, setShowUtm] = useState(false)
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null)

  const fetchData = useCallback(async () => {
    const [{ data: campaignsData }, { data: expenses }, { data: leads }] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('campaign_expenses').select('*'),
      supabase.from('leads').select('campaign_id, current_stage, amount_paid'),
    ])

    setCampaigns(campaignsData || [])

    // Compute metrics per campaign
    const m: Record<string, CampaignMetrics> = {}
    for (const c of campaignsData || []) {
      const cExpenses = (expenses || []).filter(e => e.campaign_id === c.id)
      const cLeads = (leads || []).filter(l => l.campaign_id === c.id)
      const wonLeads = cLeads.filter(l => l.current_stage === 'pagado' || l.current_stage === 'entregado')
      const totalSpend = cExpenses.reduce((s, e) => s + Number(e.amount), 0)
      const revenue = wonLeads.reduce((s, l) => s + (Number(l.amount_paid) || 0), 0)

      m[c.id] = {
        total_spend: totalSpend,
        total_leads: cLeads.length,
        won_leads: wonLeads.length,
        revenue,
        cpl: cLeads.length > 0 ? totalSpend / cLeads.length : 0,
        cac: wonLeads.length > 0 ? totalSpend / wonLeads.length : 0,
        roi: totalSpend > 0 ? ((revenue - totalSpend) / totalSpend) * 100 : 0,
      }
    }
    setMetrics(m)
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-[#94A3B8]">Cargando campañas...</p></div>
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E1B4B]">Campañas</h1>
          <p className="text-sm text-[#64748B] mt-1">{campaigns.length} campañas registradas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUtm(true)} className="px-4 py-2 rounded-xl border border-[#E0DEF7] text-sm font-semibold text-[#4F46E5] hover:bg-[#F1F0FB] transition-all cursor-pointer">
            Generador UTM
          </button>
          <button onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#6366F1] transition-all cursor-pointer">
            + Nueva campaña
          </button>
        </div>
      </div>

      {/* Campaigns Table */}
      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-[#E0DEF7] text-center">
          <p className="text-[#94A3B8]">No hay campañas. Crea tu primera campaña para empezar a trackear gastos y ROI.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const m2 = metrics[c.id] || { total_spend: 0, total_leads: 0, won_leads: 0, revenue: 0, cpl: 0, cac: 0, roi: 0 }
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-[#E0DEF7] shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${PLATFORM_COLORS[c.platform] || 'bg-gray-100 text-gray-600'}`}>
                        {PLATFORM_LABELS[c.platform] || c.platform}
                      </span>
                      <h3 className="font-bold text-[#1E1B4B]">{c.name}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-green-100 text-green-700' :
                        c.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowExpense(c.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E0DEF7] text-[#64748B] hover:bg-[#F1F0FB] transition-all cursor-pointer">
                        + Gasto
                      </button>
                      <button onClick={() => setEditCampaign(c)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#E0DEF7] text-[#64748B] hover:bg-[#F1F0FB] transition-all cursor-pointer">
                        Editar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <MetricBox label="Gasto" value={`$${m2.total_spend.toFixed(0)}`} />
                    <MetricBox label="Leads" value={m2.total_leads.toString()} />
                    <MetricBox label="Ventas" value={m2.won_leads.toString()} />
                    <MetricBox label="Revenue" value={`$${m2.revenue.toFixed(0)}`} />
                    <MetricBox label="CPL" value={`$${m2.cpl.toFixed(2)}`} />
                    <MetricBox label="ROI" value={`${m2.roi.toFixed(0)}%`} color={m2.roi > 0 ? 'text-green-600' : m2.roi < 0 ? 'text-red-500' : undefined} />
                  </div>

                  {c.utm_campaign && (
                    <p className="text-[10px] text-[#94A3B8] mt-3 font-mono">utm_campaign={c.utm_campaign}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New Campaign Modal */}
      {showNew && (
        <CampaignModal
          title="Nueva campaña"
          onClose={() => setShowNew(false)}
          onSave={async (data) => {
            await supabase.from('campaigns').insert(data)
            setShowNew(false)
            fetchData()
          }}
        />
      )}

      {/* Edit Campaign Modal */}
      {editCampaign && (
        <CampaignModal
          title="Editar campaña"
          initial={editCampaign}
          onClose={() => setEditCampaign(null)}
          onSave={async (data) => {
            await supabase.from('campaigns').update(data).eq('id', editCampaign.id)
            setEditCampaign(null)
            fetchData()
          }}
        />
      )}

      {/* Add Expense Modal */}
      {showExpense && (
        <ExpenseModal
          campaignId={showExpense}
          supabase={supabase}
          onClose={() => setShowExpense(null)}
          onSaved={() => { setShowExpense(null); fetchData() }}
        />
      )}

      {/* UTM Generator Modal */}
      {showUtm && <UtmGeneratorModal onClose={() => setShowUtm(false)} />}
    </div>
  )
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#FAFAFE] rounded-xl p-3 text-center">
      <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${color || 'text-[#1E1B4B]'} mt-0.5`}>{value}</p>
    </div>
  )
}

// ── Campaign Modal ──────────────────────────────────
function CampaignModal({ title, initial, onClose, onSave }: {
  title: string
  initial?: Campaign
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    platform: initial?.platform || 'meta_ads',
    utm_campaign: initial?.utm_campaign || '',
    start_date: initial?.start_date || new Date().toISOString().split('T')[0],
    end_date: initial?.end_date || '',
    status: initial?.status || 'active',
    notes: initial?.notes || '',
  })

  function set(key: string, val: string) { setForm(prev => ({ ...prev, [key]: val })) }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <Input label="Nombre" value={form.name} onChange={v => set('name', v)} />
        <Select label="Plataforma" value={form.platform} onChange={v => set('platform', v)} options={Object.entries(PLATFORM_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        <Input label="UTM Campaign" value={form.utm_campaign} onChange={v => set('utm_campaign', v)} placeholder="ej: meta-abril-caracas" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Fecha inicio" value={form.start_date} onChange={v => set('start_date', v)} type="date" />
          <Input label="Fecha fin" value={form.end_date} onChange={v => set('end_date', v)} type="date" />
        </div>
        <Select label="Estado" value={form.status} onChange={v => set('status', v)} options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        <Textarea label="Notas" value={form.notes} onChange={v => set('notes', v)} />
        <button onClick={() => onSave({ ...form, end_date: form.end_date || null, utm_campaign: form.utm_campaign || null, notes: form.notes || null })} className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white font-semibold text-sm hover:bg-[#6366F1] transition-all cursor-pointer">
          Guardar
        </button>
      </div>
    </Modal>
  )
}

// ── Expense Modal ───────────────────────────────────
function ExpenseModal({ campaignId, supabase, onClose, onSaved }: {
  campaignId: string
  supabase: ReturnType<typeof createClient>
  onClose: () => void
  onSaved: () => void
}) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [form, setForm] = useState({ amount: '', expense_date: new Date().toISOString().split('T')[0], description: '' })

  useEffect(() => {
    supabase.from('campaign_expenses').select('*').eq('campaign_id', campaignId).order('expense_date', { ascending: false })
      .then(({ data }) => setExpenses(data || []))
  }, [campaignId, supabase])

  async function addExpense() {
    if (!form.amount) return
    await supabase.from('campaign_expenses').insert({
      campaign_id: campaignId,
      amount: parseFloat(form.amount),
      expense_date: form.expense_date,
      description: form.description || null,
    })
    setForm({ amount: '', expense_date: new Date().toISOString().split('T')[0], description: '' })
    const { data } = await supabase.from('campaign_expenses').select('*').eq('campaign_id', campaignId).order('expense_date', { ascending: false })
    setExpenses(data || [])
    onSaved()
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <Modal title="Gastos de campaña" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Input label="Monto ($)" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" />
          <Input label="Fecha" value={form.expense_date} onChange={v => setForm(f => ({ ...f, expense_date: v }))} type="date" />
          <Input label="Descripción" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
        </div>
        <button onClick={addExpense} className="w-full py-2 rounded-xl bg-[#059669] text-white font-semibold text-sm hover:bg-[#047857] transition-all cursor-pointer">
          Agregar gasto
        </button>

        {expenses.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-bold text-[#64748B] uppercase">Historial</p>
              <p className="text-sm font-bold text-[#1E1B4B]">Total: ${total.toFixed(2)}</p>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {expenses.map(e => (
                <div key={e.id} className="flex justify-between items-center bg-[#FAFAFE] rounded-lg px-3 py-2 text-sm">
                  <span className="text-[#64748B]">{e.expense_date} {e.description && `— ${e.description}`}</span>
                  <span className="font-bold text-[#1E1B4B]">${Number(e.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── UTM Generator Modal ─────────────────────────────
function UtmGeneratorModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    source: 'facebook', medium: 'cpc', campaign: '', content: '', term: '',
  })
  const [copied, setCopied] = useState('')

  const baseUrl = 'https://tuwebgo.net'
  const waBase = 'https://wa.me/584128370378'

  const params = new URLSearchParams()
  if (form.source) params.set('utm_source', form.source)
  if (form.medium) params.set('utm_medium', form.medium)
  if (form.campaign) params.set('utm_campaign', form.campaign)
  if (form.content) params.set('utm_content', form.content)
  if (form.term) params.set('utm_term', form.term)

  const landingUrl = `${baseUrl}?${params.toString()}`
  const waUrl = `${waBase}?text=${encodeURIComponent(`Hola, quiero mi página web [campaign:${form.campaign || 'direct'}]`)}`

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <Modal title="Generador de Links UTM" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Source" value={form.source} onChange={v => setForm(f => ({ ...f, source: v }))} options={[
            { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
            { value: 'google', label: 'Google' }, { value: 'tiktok', label: 'TikTok' },
            { value: 'referral', label: 'Referral' }, { value: 'other', label: 'Otro' },
          ]} />
          <Select label="Medium" value={form.medium} onChange={v => setForm(f => ({ ...f, medium: v }))} options={[
            { value: 'cpc', label: 'CPC (Paid)' }, { value: 'social', label: 'Social (Organic)' },
            { value: 'email', label: 'Email' }, { value: 'referral', label: 'Referral' },
          ]} />
        </div>
        <Input label="Campaign" value={form.campaign} onChange={v => setForm(f => ({ ...f, campaign: v }))} placeholder="ej: abril-caracas-landing" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Content (opcional)" value={form.content} onChange={v => setForm(f => ({ ...f, content: v }))} placeholder="ej: video-1" />
          <Input label="Term (opcional)" value={form.term} onChange={v => setForm(f => ({ ...f, term: v }))} placeholder="ej: pagina-web" />
        </div>

        <div className="space-y-3 mt-2">
          <div>
            <p className="text-xs font-bold text-[#64748B] uppercase mb-1">Link para landing page</p>
            <div className="flex gap-2">
              <code className="flex-1 bg-[#FAFAFE] rounded-lg px-3 py-2 text-xs text-[#1E1B4B] break-all border border-[#E0DEF7]">{landingUrl}</code>
              <button onClick={() => copy(landingUrl, 'landing')} className="px-3 py-2 rounded-lg bg-[#4F46E5] text-white text-xs font-semibold flex-shrink-0 cursor-pointer">
                {copied === 'landing' ? '✓' : 'Copiar'}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-[#64748B] uppercase mb-1">Link directo a WhatsApp (sin landing)</p>
            <div className="flex gap-2">
              <code className="flex-1 bg-[#FAFAFE] rounded-lg px-3 py-2 text-xs text-[#1E1B4B] break-all border border-[#E0DEF7]">{waUrl}</code>
              <button onClick={() => copy(waUrl, 'wa')} className="px-3 py-2 rounded-lg bg-[#25D366] text-white text-xs font-semibold flex-shrink-0 cursor-pointer">
                {copied === 'wa' ? '✓' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Shared UI Components ────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#E0DEF7]">
          <h2 className="font-bold text-lg text-[#1E1B4B]">{title}</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E1B4B] cursor-pointer"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
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
