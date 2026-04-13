import { createClient } from '@/lib/supabase/server'

const SOURCE_LABELS: Record<string, string> = {
  landing_page: 'Landing Page',
  instagram_dm: 'Instagram DM',
  referral: 'Referido',
  meta_ads_direct: 'Meta Ads',
  organic_wa: 'WhatsApp Directo',
  other: 'Otro',
}

const PLAN_LABELS: Record<string, string> = {
  pre_diseno: 'Pre-diseño',
  landing_page: 'Landing Page',
  sitio_web: 'Sitio Web',
}

async function getAnalytics() {
  const supabase = await createClient()

  const [
    { data: sessions },
    { data: events },
    { data: leads },
    { data: ctaEvents },
  ] = await Promise.all([
    supabase.from('sessions').select('device_type, utm_source, utm_medium, utm_campaign, referrer, first_seen_at'),
    supabase.from('events').select('event_type, event_data, session_id').eq('event_type', 'section_visible'),
    supabase.from('leads').select('source_channel, plan_interested, plan_final, current_stage, amount_paid, campaign_id'),
    supabase.from('events').select('event_data').eq('event_type', 'cta_click'),
  ])

  // Channel breakdown
  const channels: Record<string, { leads: number; won: number; revenue: number }> = {}
  for (const lead of leads || []) {
    const ch = lead.source_channel
    if (!channels[ch]) channels[ch] = { leads: 0, won: 0, revenue: 0 }
    channels[ch].leads++
    if (lead.current_stage === 'pagado' || lead.current_stage === 'entregado') {
      channels[ch].won++
      channels[ch].revenue += Number(lead.amount_paid) || 0
    }
  }

  // Device breakdown
  const devices: Record<string, number> = {}
  for (const s of sessions || []) {
    const d = s.device_type || 'unknown'
    devices[d] = (devices[d] || 0) + 1
  }

  // Plan popularity
  const plans: Record<string, number> = {}
  for (const lead of leads || []) {
    const p = lead.plan_interested || 'undefined'
    plans[p] = (plans[p] || 0) + 1
  }

  // CTA heatmap
  const ctaClicks: Record<string, number> = {}
  for (const evt of ctaEvents || []) {
    const loc = (evt.event_data as Record<string, string>)?.cta_location || 'unknown'
    ctaClicks[loc] = (ctaClicks[loc] || 0) + 1
  }

  // Section visibility
  const sectionViews: Record<string, number> = {}
  for (const evt of events || []) {
    const section = (evt.event_data as Record<string, string>)?.section || 'unknown'
    sectionViews[section] = (sectionViews[section] || 0) + 1
  }

  // Sessions over time (last 30 days)
  const dailySessions: Record<string, number> = {}
  for (const s of sessions || []) {
    const day = s.first_seen_at.split('T')[0]
    dailySessions[day] = (dailySessions[day] || 0) + 1
  }

  // UTM sources
  const utmSources: Record<string, number> = {}
  for (const s of sessions || []) {
    if (s.utm_source) {
      utmSources[s.utm_source] = (utmSources[s.utm_source] || 0) + 1
    }
  }

  return {
    totalSessions: sessions?.length || 0,
    totalLeads: leads?.length || 0,
    totalCtaClicks: ctaEvents?.length || 0,
    channels,
    devices,
    plans,
    ctaClicks,
    sectionViews,
    dailySessions,
    utmSources,
  }
}

const CTA_LABELS: Record<string, string> = {
  nav: 'Navbar CTA',
  mobile_menu: 'Menú móvil',
  hero: 'Hero principal',
  pricing: 'Sección precios',
  cta_final: 'CTA final',
  floating: 'Botón flotante WA',
  footer_social: 'Footer (icono)',
  footer_link: 'Footer (link)',
  unknown: 'Desconocido',
}

const SECTION_LABELS: Record<string, string> = {
  inicio: 'Hero',
  problemas: 'Problemas',
  'como-funciona': 'Cómo funciona',
  seo: 'SEO & Rendimiento',
  precios: 'Precios',
  portafolio: 'Portafolio',
  testimonios: 'Testimonios',
  faq: 'FAQ',
  contacto: 'CTA Final',
}

export default async function AnalyticsPage() {
  const a = await getAnalytics()

  const sortedChannels = Object.entries(a.channels).sort((x, y) => y[1].revenue - x[1].revenue)
  const sortedCta = Object.entries(a.ctaClicks).sort((x, y) => y[1] - x[1])
  const sortedSections = Object.entries(a.sectionViews).sort((x, y) => y[1] - x[1])
  const maxCtaClicks = Math.max(...Object.values(a.ctaClicks), 1)
  const maxSectionViews = Math.max(...Object.values(a.sectionViews), 1)

  const hasData = a.totalSessions > 0

  return (
    <div className="animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">Analytics</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Tráfico, atribución y conversión</p>
      </div>

      {!hasData ? (
        <div className="bg-[var(--card)] rounded-2xl p-12 border border-[var(--border)] text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-[var(--text-muted)]">Aún no hay datos. Cuando la landing reciba visitas, aquí verás el análisis completo.</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Top metrics — 3 cols on mobile stacked horizontally */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="bg-[var(--card)] rounded-2xl p-3 sm:p-5 border border-[var(--border)] shadow-sm text-center">
              <p className="text-[9px] sm:text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Sesiones</p>
              <p className="text-xl sm:text-3xl font-bold text-[var(--dark)] mt-0.5 sm:mt-1 font-[Space_Grotesk,sans-serif]">{a.totalSessions}</p>
            </div>
            <div className="bg-[var(--card)] rounded-2xl p-3 sm:p-5 border border-[var(--border)] shadow-sm text-center">
              <p className="text-[9px] sm:text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Clics CTA</p>
              <p className="text-xl sm:text-3xl font-bold text-[var(--primary)] mt-0.5 sm:mt-1 font-[Space_Grotesk,sans-serif]">{a.totalCtaClicks}</p>
            </div>
            <div className="bg-[var(--card)] rounded-2xl p-3 sm:p-5 border border-[var(--border)] shadow-sm text-center">
              <p className="text-[9px] sm:text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Leads</p>
              <p className="text-xl sm:text-3xl font-bold text-[var(--green)] mt-0.5 sm:mt-1 font-[Space_Grotesk,sans-serif]">{a.totalLeads}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Channel Attribution — card-based on mobile */}
            <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm">
              <h2 className="text-sm font-bold text-[var(--dark)] uppercase tracking-wider mb-4 font-[Space_Grotesk,sans-serif]">Atribución por canal</h2>
              {sortedChannels.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Sin datos de canales</p>
              ) : (
                <div className="space-y-2.5">
                  {sortedChannels.map(([ch, data]) => (
                    <div key={ch} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 bg-[var(--bg)] sm:bg-transparent rounded-xl sm:rounded-none p-3 sm:p-0">
                      <span className="text-sm text-[var(--dark)] font-semibold sm:font-medium sm:w-32">{SOURCE_LABELS[ch] || ch}</span>
                      <div className="flex gap-3 sm:gap-4 text-xs text-[var(--text-secondary)]">
                        <span>{data.leads} leads</span>
                        <span>{data.won} ventas</span>
                        <span className="font-bold text-[var(--green)]">${data.revenue}</span>
                        <span>{data.leads > 0 ? ((data.won / data.leads) * 100).toFixed(0) : 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Device breakdown */}
            <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm">
              <h2 className="text-sm font-bold text-[var(--dark)] uppercase tracking-wider mb-4 font-[Space_Grotesk,sans-serif]">Dispositivos</h2>
              <div className="space-y-3">
                {Object.entries(a.devices).sort((x, y) => y[1] - x[1]).map(([device, count]) => {
                  const pct = ((count / a.totalSessions) * 100).toFixed(0)
                  return (
                    <div key={device} className="flex items-center gap-2 sm:gap-3">
                      <span className="text-xs sm:text-sm text-[var(--dark)] font-medium w-16 sm:w-20 capitalize">{device}</span>
                      <div className="flex-1 bg-[var(--bg-alt)] rounded-full h-6 overflow-hidden">
                        <div className="h-full bg-[var(--primary)] rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(Number(pct), 8)}%` }}>
                          <span className="text-[10px] font-bold text-white">{pct}%</span>
                        </div>
                      </div>
                      <span className="text-xs text-[var(--text-muted)] w-8 sm:w-12 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* CTA Heatmap */}
            <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm">
              <h2 className="text-sm font-bold text-[var(--dark)] uppercase tracking-wider mb-1 font-[Space_Grotesk,sans-serif]">Heatmap de CTAs</h2>
              <p className="text-xs text-[var(--text-muted)] mb-3">Qué botón de WhatsApp se presiona más</p>
              {sortedCta.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Sin clics aún</p>
              ) : (
                <div className="space-y-2">
                  {sortedCta.map(([cta, count]) => {
                    const intensity = Math.round((count / maxCtaClicks) * 100)
                    return (
                      <div key={cta}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[var(--dark)] font-medium">{CTA_LABELS[cta] || cta}</span>
                          <span className="text-[10px] font-bold text-[var(--text-muted)]">{count}</span>
                        </div>
                        <div className="bg-[var(--bg-alt)] rounded-full h-5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(intensity, 8)}%`, backgroundColor: `rgba(234, 88, 12, ${0.3 + (intensity / 100) * 0.7})` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Section Engagement */}
            <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm">
              <h2 className="text-sm font-bold text-[var(--dark)] uppercase tracking-wider mb-1 font-[Space_Grotesk,sans-serif]">Secciones más vistas</h2>
              <p className="text-xs text-[var(--text-muted)] mb-3">Qué secciones de la landing ven los visitantes</p>
              {sortedSections.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Sin datos aún</p>
              ) : (
                <div className="space-y-2">
                  {sortedSections.map(([section, count]) => {
                    const intensity = Math.round((count / maxSectionViews) * 100)
                    return (
                      <div key={section}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[var(--dark)] font-medium">{SECTION_LABELS[section] || section}</span>
                          <span className="text-[10px] font-bold text-[var(--text-muted)]">{count}</span>
                        </div>
                        <div className="bg-[var(--bg-alt)] rounded-full h-5 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light)] rounded-full"
                            style={{ width: `${Math.max(intensity, 8)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Plan Popularity */}
            <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm">
              <h2 className="text-sm font-bold text-[var(--dark)] uppercase tracking-wider mb-4 font-[Space_Grotesk,sans-serif]">Planes más solicitados</h2>
              <div className="space-y-3">
                {Object.entries(a.plans).sort((x, y) => y[1] - x[1]).map(([plan, count]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--dark)]">{PLAN_LABELS[plan] || plan}</span>
                    <span className="text-sm font-bold text-[var(--primary)]">{count} leads</span>
                  </div>
                ))}
              </div>
            </div>

            {/* UTM Sources */}
            <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm">
              <h2 className="text-sm font-bold text-[var(--dark)] uppercase tracking-wider mb-4 font-[Space_Grotesk,sans-serif]">Fuentes UTM</h2>
              {Object.keys(a.utmSources).length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Sin tráfico UTM aún. Usa el generador en Campañas.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(a.utmSources).sort((x, y) => y[1] - x[1]).map(([source, count]) => (
                    <div key={source} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--dark)]">{source}</span>
                      <span className="text-sm font-bold text-[var(--text-secondary)]">{count} sesiones</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
