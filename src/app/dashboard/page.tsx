import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { assertNoError, startOfMonthVE, monthLabelVE } from '@/lib/supabase/errors'
import {
  ICONO_CANAL, IconMarcador, IconOjo, IconClic, IconUsuario, IconDinero,
  IconLista, IconChat, IconAsistente, IconMano, IconCompra, IconFlecha,
} from '@/components/icons'

/**
 * Con Sofía atendiendo sola, lo primero que Rafael necesita al abrir el CRM
 * cambió: ya no es "cuántas sesiones tuve" sino "qué conversaciones me
 * esperan". Las métricas de marketing bajan; arriba va el trabajo del día.
 */
async function getMetrics() {
  const supabase = await createClient()
  const startOfMonth = startOfMonthVE()

  const [
    sessionsRes, ctaRes, leadsCountRes, leadsRes, recentRes, stagesRes,
    convsRes, msgsRes, costosRes,
  ] = await Promise.all([
    supabase.from('sessions').select('fingerprint_hash', { count: 'exact' }).gte('first_seen_at', startOfMonth),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('event_type', 'cta_click').gte('created_at', startOfMonth),
    // Sin importados del Excel ni pruebas: mezclados, los ratios son ficción.
    supabase.from('leads').select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth).eq('es_prueba', false).neq('source_channel', 'other'),
    supabase.from('leads').select('current_stage, amount_paid, amount_quoted')
      .eq('es_prueba', false).neq('source_channel', 'other'),
    supabase.from('leads').select('id, name, business_name, current_stage, plan_interested, source_channel, created_at')
      .eq('es_prueba', false).order('created_at', { ascending: false }).limit(8),
    supabase.from('pipeline_stages').select('*').order('sort_order'),
    supabase.from('wa_conversations')
      .select('id, unread_count, bot_activo, handoff_motivo, window_expires_at, last_message_at, display_name, leads(name)'),
    supabase.from('wa_messages').select('direction, por_bot').gte('created_at', startOfMonth),
    supabase.rpc('costos_del_mes'),
  ])

  assertNoError({
    sesiones: sessionsRes, 'clics CTA': ctaRes, 'conteo de leads': leadsCountRes,
    leads: leadsRes, 'leads recientes': recentRes, 'etapas del pipeline': stagesRes,
    conversaciones: convsRes, mensajes: msgsRes, costos: costosRes,
  })

  const stages = stagesRes.data ?? []
  const leads = leadsRes.data ?? []
  const convs = convsRes.data ?? []
  const msgs = msgsRes.data ?? []

  const ganadas = new Set(stages.filter(s => s.is_won).map(s => s.slug))
  const wonLeads = leads.filter(l => ganadas.has(l.current_stage))

  // Visitantes únicos, no sesiones: 2.374 sesiones son ~56 personas. Es el
  // número que se compara contra el gasto de Meta Ads.
  const unicos = new Set((sessionsRes.data ?? []).map(s => s.fingerprint_hash).filter(Boolean)).size

  const ahora = Date.now()
  const teEsperan = convs.filter(c => !c.bot_activo && c.handoff_motivo && c.unread_count > 0)
  const sinLeer = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0)
  const ventanaPorVencer = convs.filter(c => {
    if (!c.window_expires_at || c.unread_count === 0) return false
    const resta = new Date(c.window_expires_at).getTime() - ahora
    return resta > 0 && resta < 4 * 3600 * 1000
  }).length

  const porCobrar = leads.filter(l => l.current_stage === 'por_cobrar')

  let forecast = 0
  for (const lead of leads) {
    if (lead.current_stage === 'perdido') continue
    const prob = stages.find(s => s.slug === lead.current_stage)?.win_probability || 0
    forecast += Number(lead.amount_quoted ?? 0) * (prob / 100)
  }

  const stageCounts: Record<string, number> = {}
  for (const stage of stages) {
    stageCounts[stage.slug] = leads.filter(l => {
      const orden = stages.find(s => s.slug === l.current_stage)?.sort_order || 0
      return orden >= stage.sort_order && l.current_stage !== 'perdido'
    }).length
  }

  return {
    unicos,
    ctaClicks: ctaRes.count ?? 0,
    totalLeads: leadsCountRes.count ?? 0,
    revenue: wonLeads.reduce((s, l) => s + Number(l.amount_paid ?? 0), 0),
    wonLeads: wonLeads.length,
    recentLeads: recentRes.data ?? [],
    stages, stageCounts,
    forecast: Math.round(forecast),
    teEsperan: teEsperan.length,
    teEsperanDetalle: teEsperan
      .sort((a, b) => new Date(a.last_message_at ?? 0).getTime() - new Date(b.last_message_at ?? 0).getTime())
      .slice(0, 3),
    sinLeer, ventanaPorVencer,
    porCobrar: porCobrar.length,
    montoPorCobrar: porCobrar.reduce((s, l) => s + Number(l.amount_quoted ?? 0), 0),
    msgsSofia: msgs.filter(m => m.direction === 'out' && m.por_bot).length,
    msgsRafael: msgs.filter(m => m.direction === 'out' && !m.por_bot).length,
    msgsEntrantes: msgs.filter(m => m.direction === 'in').length,
    costos: (Array.isArray(costosRes.data) ? costosRes.data[0] : costosRes.data) as {
      wa_plantillas: number; wa_costo: number; wa_servicio_gratis: number
      ia_llamadas: number; ia_tokens_in: number; ia_tokens_out: number
      ia_costo: number; total: number
    } | null,
  }
}

const STAGE_COLORS: Record<string, string> = {
  conversando: 'bg-blue-50 text-blue-600 border-blue-200',
  por_cobrar: 'bg-amber-50 text-amber-600 border-amber-200',
  prediseno_curso: 'bg-purple-50 text-purple-600 border-purple-200',
  esperando_ok: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  en_produccion: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  entregado_final: 'bg-teal-50 text-teal-600 border-teal-200',
  perdido: 'bg-red-50 text-red-500 border-red-200',
}

const SOURCE_LABELS: Record<string, string> = {
  landing_page: 'Landing', instagram_dm: 'Instagram', referral: 'Referido',
  meta_ads_direct: 'Meta Ads', organic_wa: 'WhatsApp', other: 'Otro',
}

function CanalIcono({ canal }: { canal: string }) {
  const Icono = ICONO_CANAL[canal] ?? IconMarcador
  return (
    <span title={SOURCE_LABELS[canal] ?? canal} className="inline-flex text-[var(--text-muted)]">
      <Icono className="w-4 h-4" />
      <span className="sr-only">{SOURCE_LABELS[canal] ?? canal}</span>
    </span>
  )
}

function hace(iso: string | null) {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `${min}m`
  if (min < 1440) return `${Math.floor(min / 60)}h`
  return `${Math.floor(min / 1440)}d`
}

export default async function DashboardPage() {
  const m = await getMetrics()

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[family-name:var(--font-display)] tracking-tight">Hoy</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Lo que necesita tu atención · {monthLabelVE()}</p>
      </div>

      {/* ── Lo que espera acción ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Accion href="/dashboard/inbox" valor={m.teEsperan} etiqueta="Te esperan"
          sub={m.teEsperan > 0 ? 'Sofía se apartó' : 'nada pendiente'}
          icono={<IconMano className="w-[18px] h-[18px]" />} urgente />
        <Accion href="/dashboard/inbox" valor={m.sinLeer} etiqueta="Sin leer"
          sub="mensajes de clientes" icono={<IconChat className="w-[18px] h-[18px]" />} />
        <Accion href="/dashboard/inbox" valor={m.ventanaPorVencer} etiqueta="Ventana por vencer"
          sub="menos de 4 horas" icono={<IconAsistente className="w-[18px] h-[18px]" />} urgente />
        <Accion href="/dashboard/pipeline" valor={m.porCobrar} etiqueta="Por cobrar $50"
          sub={m.montoPorCobrar > 0 ? `$${m.montoPorCobrar} en juego` : 'ninguno'}
          icono={<IconCompra className="w-[18px] h-[18px]" />} urgente />
      </div>

      {/* ── Quiénes esperan ── */}
      {m.teEsperanDetalle.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-2.5 font-[family-name:var(--font-display)]">
            Conversaciones esperando por ti
          </p>
          <div className="space-y-1">
            {m.teEsperanDetalle.map((c) => (
              <Link key={c.id} href="/dashboard/inbox"
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-amber-100/60 transition-colors group">
                <span className="text-sm font-semibold text-amber-950 truncate flex-1">
                  {(c.leads as { name?: string } | null)?.name || c.display_name || 'Sin nombre'}
                </span>
                <span className="text-[11px] text-amber-800 flex-shrink-0 hidden sm:inline">{c.handoff_motivo}</span>
                <span className="text-[11px] text-amber-700 font-mono flex-shrink-0">{hace(c.last_message_at)}</span>
                <IconFlecha className="w-3.5 h-3.5 text-amber-700 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Sofía este mes ── */}
      <div className="mb-6 bg-[var(--card)] rounded-2xl p-5 border border-[var(--border)] shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 rounded-full gradient-bar" />
          <h2 className="text-sm font-bold text-[var(--dark)] font-[family-name:var(--font-display)] uppercase tracking-wider">Sofía este mes</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Mini valor={m.msgsEntrantes} etiqueta="Recibidos" />
          <Mini valor={m.msgsSofia} etiqueta="Respondió Sofía" destacado />
          <Mini valor={m.msgsRafael} etiqueta="Respondiste tú" />
        </div>
        {m.msgsSofia + m.msgsRafael > 0 && (
          <p className="text-[11px] text-[var(--text-muted)] mt-3 pt-3 border-t border-[var(--border-light)]">
            Sofía manejó el <span className="font-semibold text-[var(--primary)]">
              {Math.round((m.msgsSofia / (m.msgsSofia + m.msgsRafael)) * 100)}%
            </span> de las respuestas.
          </p>
        )}
      </div>

      {/* ── Cuánto cuesta Sofía ── */}
      {m.costos && (
        <div className="mb-6 bg-[var(--card)] rounded-2xl p-5 border border-[var(--border)] shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full gradient-bar" />
              <h2 className="text-sm font-bold text-[var(--dark)] font-[family-name:var(--font-display)] uppercase tracking-wider">
                Costo del mes
              </h2>
            </div>
            <p className="text-2xl font-bold text-[var(--dark)] font-[family-name:var(--font-display)] tabular-nums">
              ${Number(m.costos.total).toFixed(2)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--bg-alt)] border border-[var(--border-light)]">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">WhatsApp</p>
              <p className="text-lg font-bold text-[var(--dark)] font-[family-name:var(--font-display)] tabular-nums mt-0.5">
                ${Number(m.costos.wa_costo).toFixed(2)}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {m.costos.wa_plantillas} {m.costos.wa_plantillas === 1 ? 'plantilla' : 'plantillas'} enviadas
              </p>
              {m.costos.wa_servicio_gratis > 0 && (
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  +{m.costos.wa_servicio_gratis} respuestas sin costo
                </p>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-alt)] border border-[var(--border-light)]">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Gemini</p>
              <p className="text-lg font-bold text-[var(--dark)] font-[family-name:var(--font-display)] tabular-nums mt-0.5">
                ${Number(m.costos.ia_costo).toFixed(2)}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {m.costos.ia_llamadas} {m.costos.ia_llamadas === 1 ? 'respuesta' : 'respuestas'} redactadas
              </p>
              {m.costos.ia_llamadas > 0 && (
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                  {((Number(m.costos.ia_tokens_in) + Number(m.costos.ia_tokens_out)) / 1000).toFixed(1)}k tokens
                </p>
              )}
            </div>
          </div>

          {m.costos.wa_plantillas > 0 && m.wonLeads > 0 && (
            <p className="text-[11px] text-[var(--text-secondary)] mt-3 pt-3 border-t border-[var(--border-light)]">
              Costo por venta cerrada:{' '}
              <span className="font-semibold text-[var(--dark)] tabular-nums">
                ${(Number(m.costos.total) / m.wonLeads).toFixed(2)}
              </span>
            </p>
          )}

          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            Estimado con precios de lista. La factura de Meta y la de Google son la cifra real.
          </p>
        </div>
      )}

      {/* ── Marketing ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Visitantes" value={m.unicos} sub="personas únicas" icon={<IconOjo className="w-[18px] h-[18px]" />} gradient="from-indigo-500 to-violet-600" />
        <KpiCard label="Clics CTA" value={m.ctaClicks} sub={m.unicos > 0 ? `${((m.ctaClicks / m.unicos) * 100).toFixed(0)}% de visitantes` : 'sin visitas'} icon={<IconClic className="w-[18px] h-[18px]" />} gradient="from-blue-500 to-cyan-500" />
        <KpiCard label="Leads nuevos" value={m.totalLeads} sub="este mes, sin importados" icon={<IconUsuario className="w-[18px] h-[18px]" />} gradient="from-emerald-500 to-teal-500" />
        <KpiCard label="Cobrado" value={`$${m.revenue}`} sub={`${m.wonLeads} ${m.wonLeads === 1 ? 'venta' : 'ventas'}`} icon={<IconDinero className="w-[18px] h-[18px]" />} gradient="from-amber-500 to-orange-500" />
      </div>

      <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="lg:col-span-3 bg-[var(--card)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-sm card-hover">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-5 rounded-full gradient-bar"></div>
            <h2 className="text-sm font-bold text-[var(--dark)] font-[family-name:var(--font-display)] uppercase tracking-wider">Pipeline</h2>
          </div>
          <div className="space-y-3 stagger">
            {m.stages.filter(s => !s.is_lost).map((stage) => {
              const count = m.stageCounts[stage.slug] || 0
              const maxCount = Math.max(...Object.values(m.stageCounts), 1)
              return (
                <div key={stage.slug} className="flex items-center gap-2 sm:gap-3 group">
                  <span className="text-[11px] sm:text-xs text-[var(--text-secondary)] w-24 sm:w-40 text-right flex-shrink-0 font-medium truncate">{stage.label}</span>
                  <div className="flex-1 bg-[var(--bg-alt)] rounded-full h-8 overflow-hidden relative">
                    <div className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light)] rounded-full flex items-center justify-end pr-3 bar-fill group-hover:brightness-110 transition-all"
                      style={{ width: `${Math.max((count / maxCount) * 100, 6)}%` }}>
                      <span className="text-xs font-bold text-white drop-shadow-sm">{count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gradient-to-br from-[var(--dark)] to-[var(--dark-soft)] rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden card-hover">
            <div className="absolute inset-0 grain"></div>
            <div className="absolute top-[-50px] right-[-50px] w-[150px] h-[150px] rounded-full bg-[var(--primary)]/20 blur-[60px]"></div>
            <div className="relative z-10">
              <p className="text-white/50 text-xs font-[family-name:var(--font-display)] font-semibold uppercase tracking-wider mb-1">Forecast ponderado</p>
              <p className="text-4xl font-bold font-[family-name:var(--font-display)] tracking-tight">${m.forecast}</p>
              <p className="text-white/40 text-xs mt-2">Valor esperado del pipeline activo</p>
            </div>
          </div>

          <div className="bg-[var(--card)] rounded-2xl p-5 border border-[var(--border)] shadow-sm card-hover">
            <p className="text-[var(--text-secondary)] text-xs font-[family-name:var(--font-display)] font-semibold uppercase tracking-wider mb-3">Por etapa</p>
            <div className="flex flex-wrap gap-2">
              {m.stages.filter(s => !s.is_lost).map(stage => {
                const count = m.stageCounts[stage.slug] || 0
                if (count === 0) return null
                return (
                  <span key={stage.slug} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${STAGE_COLORS[stage.slug] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
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

      {/* ── Leads recientes ── */}
      <div className="mt-6 bg-[var(--card)] rounded-2xl p-4 sm:p-6 border border-[var(--border)] shadow-sm card-hover">
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <div className="w-1 h-5 rounded-full gradient-bar"></div>
          <h2 className="text-sm font-bold text-[var(--dark)] font-[family-name:var(--font-display)] uppercase tracking-wider">Leads recientes</h2>
        </div>
        {m.recentLeads.length === 0 ? (
          <div className="text-center py-12">
            <IconLista className="w-9 h-9 mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.4} />
            <p className="text-sm text-[var(--text-muted)]">No hay leads aún</p>
          </div>
        ) : (
          <>
            <div className="sm:hidden space-y-2.5 stagger">
              {m.recentLeads.map((lead) => (
                <div key={lead.id} className="bg-[var(--bg)] rounded-xl p-3.5 border border-[var(--border-light)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-[var(--dark)] truncate">{lead.name || 'Sin nombre'}</p>
                      {lead.business_name && <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{lead.business_name}</p>}
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold border flex-shrink-0 ${STAGE_COLORS[lead.current_stage] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                      {m.stages.find(s => s.slug === lead.current_stage)?.label || lead.current_stage}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2"><CanalIcono canal={lead.source_channel} /></div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Nombre','Negocio','Canal','Etapa'].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider font-[family-name:var(--font-display)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="stagger">
                  {m.recentLeads.map((lead) => (
                    <tr key={lead.id} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-alt)]/50 transition-colors">
                      <td className="py-3 px-3 font-semibold text-[var(--dark)]">{lead.name || 'Sin nombre'}</td>
                      <td className="py-3 px-3 text-[var(--text-secondary)]">{lead.business_name || '—'}</td>
                      <td className="py-3 px-3"><CanalIcono canal={lead.source_channel} /></td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold border ${STAGE_COLORS[lead.current_stage] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
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

/** Tarjeta de acción: clicable, lleva al lugar donde se resuelve. */
function Accion({ href, valor, etiqueta, sub, icono, urgente = false }: {
  href: string; valor: number; etiqueta: string; sub: string
  icono: React.ReactNode; urgente?: boolean
}) {
  const alerta = urgente && valor > 0
  return (
    <Link href={href}
      className={`rounded-2xl p-4 border shadow-sm transition-all hover:shadow-md active:scale-[0.98] block ${
        alerta ? 'bg-amber-50 border-amber-300' : 'bg-[var(--card)] border-[var(--border)]'
      }`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className={`text-[10px] font-bold uppercase tracking-wider font-[family-name:var(--font-display)] ${alerta ? 'text-amber-900' : 'text-[var(--text-muted)]'}`}>{etiqueta}</p>
        <span className={alerta ? 'text-amber-700' : 'text-[var(--text-muted)]'}>{icono}</span>
      </div>
      <p className={`text-2xl font-bold font-[family-name:var(--font-display)] tracking-tight ${alerta ? 'text-amber-950' : 'text-[var(--dark)]'}`}>{valor}</p>
      <p className={`text-[10px] mt-0.5 ${alerta ? 'text-amber-800' : 'text-[var(--text-muted)]'}`}>{sub}</p>
    </Link>
  )
}

function Mini({ valor, etiqueta, destacado = false }: { valor: number; etiqueta: string; destacado?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold font-[family-name:var(--font-display)] ${destacado ? 'text-[var(--primary)]' : 'text-[var(--dark)]'}`}>{valor}</p>
      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">{etiqueta}</p>
    </div>
  )
}

function KpiCard({ label, value, sub, icon, gradient }: { label: string; value: string | number; sub: string; icon: React.ReactNode; gradient: string }) {
  return (
    <div className="bg-[var(--card)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-sm card-hover relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl ${gradient} opacity-[0.04] rounded-bl-[60px] group-hover:opacity-[0.08] transition-opacity duration-500`}></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] sm:text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider font-[family-name:var(--font-display)]">{label}</p>
          <span className="text-[var(--text-muted)]">{icon}</span>
        </div>
        <p className="text-xl sm:text-2xl font-bold text-[var(--dark)] font-[family-name:var(--font-display)] tracking-tight">{value}</p>
        <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-1">{sub}</p>
      </div>
    </div>
  )
}
