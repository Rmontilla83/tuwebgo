import { createClient } from '@/lib/supabase/server'

async function getMetrics() {
  const supabase = await createClient()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { count: totalSessions },
    { count: ctaClicks },
    { count: totalLeads },
    { data: leads },
    { data: recentLeads },
    { data: stages },
  ] = await Promise.all([
    supabase.from('sessions').select('*', { count: 'exact', head: true }).gte('first_seen_at', startOfMonth),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('event_type', 'cta_click').gte('created_at', startOfMonth),
    supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
    supabase.from('leads').select('current_stage, amount_paid').gte('created_at', startOfMonth),
    supabase.from('leads').select('id, name, business_name, current_stage, plan_interested, source_channel, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('pipeline_stages').select('*').order('sort_order'),
  ])

  const wonLeads = leads?.filter(l => l.current_stage === 'pagado' || l.current_stage === 'entregado') || []
  const revenue = wonLeads.reduce((sum, l) => sum + (l.amount_paid || 0), 0)
  const conversionRate = (totalSessions || 0) > 0 ? ((wonLeads.length / (totalSessions || 1)) * 100).toFixed(1) : '0'

  // Funnel counts
  const stageCounts: Record<string, number> = {}
  for (const stage of stages || []) {
    const matching = leads?.filter(l => {
      const stageOrder = stages?.find(s => s.slug === l.current_stage)?.sort_order || 0
      const thisOrder = stage.sort_order
      return stageOrder >= thisOrder && l.current_stage !== 'perdido'
    }) || []
    stageCounts[stage.slug] = matching.length
  }

  return {
    totalSessions: totalSessions || 0,
    ctaClicks: ctaClicks || 0,
    totalLeads: totalLeads || 0,
    revenue,
    conversionRate,
    wonLeads: wonLeads.length,
    recentLeads: recentLeads || [],
    stages: stages || [],
    stageCounts,
  }
}

const STAGE_COLORS: Record<string, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  contactado: 'bg-yellow-100 text-yellow-700',
  pre_diseno_enviado: 'bg-purple-100 text-purple-700',
  aprobado: 'bg-indigo-100 text-indigo-700',
  pagado: 'bg-green-100 text-green-700',
  entregado: 'bg-emerald-100 text-emerald-700',
  perdido: 'bg-red-100 text-red-700',
}

const SOURCE_LABELS: Record<string, string> = {
  landing_page: 'Landing',
  instagram_dm: 'Instagram',
  referral: 'Referido',
  meta_ads_direct: 'Meta Ads',
  organic_wa: 'WhatsApp',
  other: 'Otro',
}

export default async function DashboardPage() {
  const m = await getMetrics()

  const kpis = [
    { label: 'Sesiones', value: m.totalSessions, sub: 'este mes' },
    { label: 'Clics CTA', value: m.ctaClicks, sub: `${m.totalSessions > 0 ? ((m.ctaClicks / m.totalSessions) * 100).toFixed(0) : 0}% de sesiones` },
    { label: 'Leads', value: m.totalLeads, sub: `${m.ctaClicks > 0 ? ((m.totalLeads / m.ctaClicks) * 100).toFixed(0) : 0}% de clics` },
    { label: 'Revenue', value: `$${m.revenue}`, sub: `${m.wonLeads} ventas` },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1E1B4B]">Dashboard</h1>
        <p className="text-sm text-[#64748B] mt-1">Resumen del mes actual</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl p-5 border border-[#E0DEF7] shadow-sm">
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">{kpi.label}</p>
            <p className="text-2xl font-bold text-[#1E1B4B] mt-1">{kpi.value}</p>
            <p className="text-xs text-[#94A3B8] mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-2xl p-6 border border-[#E0DEF7] shadow-sm mb-8">
        <h2 className="text-sm font-bold text-[#1E1B4B] uppercase tracking-wider mb-5">Funnel de conversión</h2>
        <div className="space-y-3">
          {m.stages.filter(s => !s.is_lost).map((stage) => {
            const count = m.stageCounts[stage.slug] || 0
            const maxCount = Math.max(...Object.values(m.stageCounts), 1)
            const width = Math.max((count / maxCount) * 100, 4)
            return (
              <div key={stage.slug} className="flex items-center gap-3">
                <span className="text-xs text-[#64748B] w-36 text-right flex-shrink-0">{stage.label}</span>
                <div className="flex-1 bg-[#F1F0FB] rounded-full h-7 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#4F46E5] to-[#6366F1] rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-xs font-bold text-white">{count}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Leads */}
      <div className="bg-white rounded-2xl p-6 border border-[#E0DEF7] shadow-sm">
        <h2 className="text-sm font-bold text-[#1E1B4B] uppercase tracking-wider mb-5">Leads recientes</h2>
        {m.recentLeads.length === 0 ? (
          <p className="text-sm text-[#94A3B8] text-center py-8">No hay leads aún. Cuando alguien te escriba por WhatsApp y lo registres aquí, aparecerá en esta lista.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E0DEF7]">
                  <th className="text-left py-2 px-2 text-xs font-semibold text-[#64748B] uppercase">Nombre</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-[#64748B] uppercase">Negocio</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-[#64748B] uppercase">Plan</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-[#64748B] uppercase">Canal</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-[#64748B] uppercase">Etapa</th>
                </tr>
              </thead>
              <tbody>
                {m.recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-[#F1F0FB] hover:bg-[#FAFAFE]">
                    <td className="py-2.5 px-2 font-medium text-[#1E1B4B]">{lead.name || 'Sin nombre'}</td>
                    <td className="py-2.5 px-2 text-[#64748B]">{lead.business_name || '—'}</td>
                    <td className="py-2.5 px-2 text-[#64748B]">{lead.plan_interested || '—'}</td>
                    <td className="py-2.5 px-2 text-[#64748B]">{SOURCE_LABELS[lead.source_channel] || lead.source_channel}</td>
                    <td className="py-2.5 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_COLORS[lead.current_stage] || 'bg-gray-100 text-gray-600'}`}>
                        {m.stages.find(s => s.slug === lead.current_stage)?.label || lead.current_stage}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
