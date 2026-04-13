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
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">Campañas</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{campaigns.length} campañas registradas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUtm(true)} className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs sm:text-sm font-semibold text-[var(--primary)] hover:bg-[var(--bg-alt)] transition-all cursor-pointer">
            UTM
          </button>
          <button onClick={() => setShowNew(true)} className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs sm:text-sm font-semibold hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20">
            + Campaña
          </button>
        </div>
      </div>

      {/* Campaigns Table */}
      {campaigns.length === 0 ? (
        <div className="bg-[var(--card)] rounded-2xl p-12 border border-[var(--border)] text-center">
          <p className="text-4xl mb-3">📢</p>
          <p className="text-[var(--text-muted)]">No hay campañas. Crea tu primera para trackear gastos y ROI.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const m2 = metrics[c.id] || { total_spend: 0, total_leads: 0, won_leads: 0, revenue: 0, cpl: 0, cac: 0, roi: 0 }
            return (
              <div key={c.id} className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${PLATFORM_COLORS[c.platform] || 'bg-gray-100 text-gray-600'}`}>
                        {PLATFORM_LABELS[c.platform] || c.platform}
                      </span>
                      <h3 className="font-bold text-[var(--dark)] text-sm sm:text-base">{c.name}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-green-100 text-green-700' :
                        c.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowExpense(c.id)} className="px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-alt)] transition-all cursor-pointer active:scale-[0.97]">
                        + Gasto
                      </button>
                      <button onClick={() => setEditCampaign(c)} className="px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-alt)] transition-all cursor-pointer active:scale-[0.97]">
                        Editar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                    <MetricBox label="Gasto" value={`$${m2.total_spend.toFixed(0)}`} />
                    <MetricBox label="Leads" value={m2.total_leads.toString()} />
                    <MetricBox label="Ventas" value={m2.won_leads.toString()} />
                    <MetricBox label="Revenue" value={`$${m2.revenue.toFixed(0)}`} />
                    <MetricBox label="CPL" value={`$${m2.cpl.toFixed(2)}`} />
                    <MetricBox label="ROI" value={`${m2.roi.toFixed(0)}%`} color={m2.roi > 0 ? 'text-green-600' : m2.roi < 0 ? 'text-red-500' : undefined} />
                  </div>

                  {c.utm_campaign && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-3 font-mono truncate">utm_campaign={c.utm_campaign}</p>
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
    <div className="bg-[var(--bg)] rounded-xl p-2 sm:p-3 text-center">
      <p className="text-[8px] sm:text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
      <p className={`text-sm sm:text-lg font-bold ${color || 'text-[var(--dark)]'} mt-0.5 font-[Space_Grotesk,sans-serif]`}>{value}</p>
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
        <button onClick={() => onSave({ ...form, end_date: form.end_date || null, utm_campaign: form.utm_campaign || null, notes: form.notes || null })} className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[Space_Grotesk,sans-serif] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.98]">
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
        <div className="grid grid-cols-2 gap-2">
          <Input label="Monto ($)" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" />
          <Input label="Fecha" value={form.expense_date} onChange={v => setForm(f => ({ ...f, expense_date: v }))} type="date" />
        </div>
        <Input label="Descripción" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
        <button onClick={addExpense} className="w-full py-2.5 rounded-xl bg-[var(--green)] text-white font-semibold text-sm hover:brightness-110 transition-all cursor-pointer active:scale-[0.98]">
          Agregar gasto
        </button>

        {expenses.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase">Historial</p>
              <p className="text-sm font-bold text-[var(--dark)]">Total: ${total.toFixed(2)}</p>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {expenses.map(e => (
                <div key={e.id} className="flex justify-between items-center bg-[var(--bg)] rounded-lg px-3 py-2.5 text-sm gap-2">
                  <span className="text-[var(--text-secondary)] text-xs truncate">{e.expense_date} {e.description && `— ${e.description}`}</span>
                  <span className="font-bold text-[var(--dark)] flex-shrink-0">${Number(e.amount).toFixed(2)}</span>
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
    <Modal title="Generador UTM" onClose={onClose}>
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
          <Input label="Content" value={form.content} onChange={v => setForm(f => ({ ...f, content: v }))} placeholder="ej: video-1" />
          <Input label="Term" value={form.term} onChange={v => setForm(f => ({ ...f, term: v }))} placeholder="ej: pagina-web" />
        </div>

        <div className="space-y-3 mt-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase">Link landing</p>
              <button onClick={() => copy(landingUrl, 'landing')} className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-[10px] font-semibold cursor-pointer active:scale-[0.95]">
                {copied === 'landing' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <code className="block bg-[var(--bg)] rounded-xl px-3 py-2.5 text-[11px] text-[var(--dark)] break-all border border-[var(--border)] leading-relaxed">{landingUrl}</code>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase">WhatsApp directo</p>
              <button onClick={() => copy(waUrl, 'wa')} className="px-3 py-1.5 rounded-lg bg-[var(--green-wa)] text-white text-[10px] font-semibold cursor-pointer active:scale-[0.95]">
                {copied === 'wa' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <code className="block bg-[var(--bg)] rounded-xl px-3 py-2.5 text-[11px] text-[var(--dark)] break-all border border-[var(--border)] leading-relaxed">{waUrl}</code>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Shared UI Components ────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto" style={{pointerEvents:'none'}}>
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md my-8 shadow-2xl animate-fade-in-scale border border-[var(--border-light)]" style={{pointerEvents:'auto'}} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="font-bold text-lg text-[var(--dark)] font-[Space_Grotesk,sans-serif]">{title}</h2>
              <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--dark)] cursor-pointer p-1.5 rounded-lg hover:bg-[var(--bg-alt)]"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
          </div>
        </div>
      </div>
    </>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all" />
    </div>
  )
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
        className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all resize-none" />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
