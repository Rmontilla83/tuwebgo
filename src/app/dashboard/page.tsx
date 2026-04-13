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
    supabase.from('leads').select('current_stage, amount_paid, amount_quoted').gte('created_at', startOfMonth),
    supabase.from('leads').select('id, name, business_name, current_stage, plan_interested, source_channel, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('pipeline_stages').select('*, win_probability').order('sort_order'),
  ])

  const wonLeads = leads?.filter(l => l.current_stage === 'pagado' || l.current_stage === 'entregado') || []
  const revenue = wonLeads.reduce((sum, l) => sum + (l.amount_paid || 0), 0)

  // Forecast ponderado
  let forecast = 0
  for (const lead of leads || []) {
    if (lead.current_stage === 'perdido') continue
    const prob = stages?.find(s => s.slug === lead.current_stage)?.win_probability || 0
    forecast += (lead.amount_quoted || 0) * (prob / 100)
  }
  forecast = Math.round(forecast)

  const stageCounts: Record<string, number> = {}
  for (const stage of stages || []) {
    const matching = leads?.filter(l => {
      const stageOrder = stages?.find(s => s.slug === l.current_stage)?.sort_order || 0
      return stageOrder >= stage.sort_order && l.current_stage !== 'perdido'
    }) || []
    stageCounts[stage.slug] = matching.length
  }

  return {
    totalSessions: totalSessions || 0,
    ctaClicks: ctaClicks || 0,
    totalLeads: totalLeads || 0,
    revenue,
    wonLeads: wonLeads.length,
    recentLeads: recentLeads || [],
    stages: stages || [],
    stageCounts,
    forecast,
  }
}

const STAGE_COLORS: Record<string, string> = {
  nuevo: 'bg-blue-50 text-blue-600 border-blue-200',
  contactado: 'bg-amber-50 text-amber-600 border-amber-200',
  pre_diseno_enviado: 'bg-purple-50 text-purple-600 border-purple-200',
  aprobado: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  pagado: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  entregado: 'bg-teal-50 text-teal-600 border-teal-200',
  perdido: 'bg-red-50 text-red-500 border-red-200',
}

const SOURCE_ICONS: Record<string, string> = {
  landing_page: '🌐', instagram_dm: '📸', referral: '🤝',
  meta_ads_direct: '📢', organic_wa: '💬', other: '📌',
}

const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default async function DashboardPage() {
  const m = await getMetrics()
  const now = new Date()
  const monthLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`

  const clickRate = m.totalSessions > 0 ? ((m.ctaClicks / m.totalSessions) * 100).toFixed(1) : '0'
  const leadRate = m.ctaClicks > 0 ? ((m.totalLeads / m.ctaClicks) * 100).toFixed(1) : '0'

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{monthLabel}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 stagger">
        <KpiCard label="Sesiones" value={m.totalSessions} sub="visitantes únicos" icon="👁" gradient="from-indigo-500 to-violet-600" />
        <KpiCard label="Clics CTA" value={m.ctaClicks} sub={`${clickRate}% de sesiones`} icon="🖱" gradient="from-blue-500 to-cyan-500" />
        <KpiCard label="Leads" value={m.totalLeads} sub={`${leadRate}% de clics`} icon="👤" gradient="from-emerald-500 to-teal-500" />
        <KpiCard label="Revenue" value={`$${m.revenue}`} sub={`${m.wonLeads} ventas`} icon="💰" gradient="from-amber-500 to-orange-500" />
      </div>

      <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">
        {/* Funnel */}
        <div className="lg:col-span-3 bg-[var(--card)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-sm card-hover">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-5 rounded-full gradient-bar"></div>
            <h2 className="text-sm font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] uppercase tracking-wider">Funnel de conversión</h2>
          </div>
          <div className="space-y-3 stagger">
            {m.stages.filter(s => !s.is_lost).map((stage) => {
              const count = m.stageCounts[stage.slug] || 0
              const maxCount = Math.max(...Object.values(m.stageCounts), 1)
              const width = Math.max((count / maxCount) * 100, 6)
              return (
                <div key={stage.slug} className="flex items-center gap-2 sm:gap-3 group">
                  <span className="text-[11px] sm:text-xs text-[var(--text-secondary)] w-20 sm:w-36 text-right flex-shrink-0 font-medium truncate">{stage.label}</span>
                  <div className="flex-1 bg-[var(--bg-alt)] rounded-full h-8 overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light)] rounded-full flex items-center justify-end pr-3 bar-fill group-hover:brightness-110 transition-all"
                      style={{ width: `${width}%` }}
                    >
                      <span className="text-xs font-bold text-white drop-shadow-sm">{count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gradient-to-br from-[var(--dark)] to-[var(--dark-soft)] rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden card-hover">
            <div className="absolute inset-0 grain"></div>
            <div className="absolute top-[-50px] right-[-50px] w-[150px] h-[150px] rounded-full bg-[var(--primary)]/20 blur-[60px]"></div>
            <div className="relative z-10">
              <p className="text-white/50 text-xs font-[Space_Grotesk,sans-serif] font-semibold uppercase tracking-wider mb-1">Conversión total</p>
              <p className="text-4xl font-bold font-[Space_Grotesk,sans-serif] tracking-tight">
                {m.totalSessions > 0 ? ((m.wonLeads / m.totalSessions) * 100).toFixed(1) : '0'}%
              </p>
              <p className="text-white/40 text-xs mt-2">Sesión → Venta cerrada</p>
            {m.forecast > 0 && <p className="text-white/50 text-xs mt-3 pt-3 border-t border-white/10">Forecast ponderado: <span className="text-white font-bold">${m.forecast}</span></p>}
            </div>
          </div>

          <div className="bg-[var(--card)] rounded-2xl p-5 border border-[var(--border)] shadow-sm card-hover">
            <p className="text-[var(--text-secondary)] text-xs font-[Space_Grotesk,sans-serif] font-semibold uppercase tracking-wider mb-3">Pipeline actual</p>
            <div className="flex flex-wrap gap-2">
              {m.stages.filter(s => !s.is_lost).map(stage => {
                const count = m.stageCounts[stage.slug] || 0
                if (count === 0) return null
                return (
                  <span key={stage.slug} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${STAGE_COLORS[stage.slug]}`}>
                    {stage.label} <span className="font-bold">{count}</span>
                  </span>
                )
              })}
              {Object.values(m.stageCounts).every(v => v === 0) && (
                <p className="text-xs text-[var(--text-muted)]">Sin leads activos</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Leads */}
      <div className="mt-6 bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm card-hover">
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <div className="w-1 h-5 rounded-full gradient-bar"></div>
          <h2 className="text-sm font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] uppercase tracking-wider">Leads recientes</h2>
        </div>
        {m.recentLeads.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm text-[var(--text-muted)]">No hay leads aún</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Cuando registres un lead en Pipeline, aparecerá aquí</p>
          </div>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="sm:hidden space-y-2.5 stagger">
              {m.recentLeads.map((lead) => (
                <div key={lead.id} className="bg-[var(--bg)] rounded-xl p-3.5 border border-[var(--border-light)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-[var(--dark)] truncate">{lead.name || 'Sin nombre'}</p>
                      {lead.business_name && <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{lead.business_name}</p>}
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold border flex-shrink-0 ${STAGE_COLORS[lead.current_stage] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                      {m.stages.find(s => s.slug === lead.current_stage)?.label || lead.current_stage}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs">{SOURCE_ICONS[lead.source_channel] || '📌'}</span>
                    {lead.plan_interested && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--card)] text-[var(--primary)] border border-[var(--border-light)]">
                        {({ pre_diseno: 'Pre-diseño', landing_page: 'Landing', sitio_web: 'Sitio Web' } as Record<string, string>)[lead.plan_interested] || lead.plan_interested}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Nombre','Negocio','Plan','Canal','Etapa'].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider font-[Space_Grotesk,sans-serif]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="stagger">
                  {m.recentLeads.map((lead) => (
                    <tr key={lead.id} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-alt)]/50 transition-colors">
                      <td className="py-3 px-3 font-semibold text-[var(--dark)]">{lead.name || 'Sin nombre'}</td>
                      <td className="py-3 px-3 text-[var(--text-secondary)]">{lead.business_name || '—'}</td>
                      <td className="py-3 px-3 text-[var(--text-secondary)]">{lead.plan_interested ? ({ pre_diseno: 'Pre-diseño', landing_page: 'Landing', sitio_web: 'Sitio Web' } as Record<string, string>)[lead.plan_interested] || lead.plan_interested : '—'}</td>
                      <td className="py-3 px-3">{SOURCE_ICONS[lead.source_channel] || '📌'}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold border ${STAGE_COLORS[lead.current_stage] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {m.stages.find(s => s.slug === lead.current_stage)?.label || lead.current_stage}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, icon, gradient }: { label: string; value: string | number; sub: string; icon: string; gradient: string }) {
  return (
    <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-sm card-hover relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${gradient} opacity-[0.04] rounded-bl-[60px] group-hover:opacity-[0.08] transition-opacity duration-500`}></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] sm:text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider font-[Space_Grotesk,sans-serif]">{label}</p>
          <span className="text-lg">{icon}</span>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">{value}</p>
        <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-1">{sub}</p>
      </div>
    </div>
  )
}
