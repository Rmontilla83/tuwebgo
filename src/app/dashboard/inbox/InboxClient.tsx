'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPhoneVE, templatesForStage, waLink } from '@/lib/whatsapp'

export type Conversation = {
  id: string
  lead_id: string | null
  phone_e164: string
  display_name: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_direction: 'in' | 'out' | null
  unread_count: number
  window_expires_at: string | null
  status: string
  leads?: { name: string | null; business_name: string | null; current_stage: string } | null
}

type Message = {
  id: number
  conversation_id: string
  direction: 'in' | 'out'
  channel: 'cloud_api' | 'deeplink'
  msg_type: string
  body: string | null
  status: string
  template_name: string | null
  created_at: string
}

function horaCorta(iso: string) {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
}

function fechaRelativa(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) return horaCorta(iso)
  const ayer = new Date(hoy.getTime() - 86400000)
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
}

/** Ventana de servicio de 24h de Meta: fuera de ella solo se envían plantillas aprobadas. */
function ventana(conv: Conversation | null) {
  if (!conv?.window_expires_at) return { abierta: false, texto: 'Sin ventana abierta' }
  const restante = new Date(conv.window_expires_at).getTime() - Date.now()
  if (restante <= 0) return { abierta: false, texto: 'Ventana de 24h cerrada' }
  const h = Math.floor(restante / 3600000)
  const m = Math.floor((restante % 3600000) / 60000)
  return { abierta: true, texto: `Ventana abierta · ${h}h ${m}m` }
}

export default function InboxClient({ initial }: { initial: Conversation[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [convs, setConvs] = useState<Conversation[]>(initial)
  const [activa, setActiva] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const finRef = useRef<HTMLDivElement>(null)

  const conv = convs.find((c) => c.id === activa) ?? null

  const recargarConvs = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('wa_conversations')
      .select('*, leads(name, business_name, current_stage)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(0, 49)
    if (err) { setError(err.message); return }
    setConvs((data as Conversation[]) ?? [])
  }, [supabase])

  // Abrir una conversación es una acción del usuario, no un efecto: cargamos los
  // mensajes acá y no en un useEffect sobre `activa`.
  async function abrir(id: string) {
    setActiva(id)
    setMensajes([])
    const { data, error: err } = await supabase
      .from('wa_messages').select('*').eq('conversation_id', id)
      .order('created_at', { ascending: true }).range(0, 199)
    if (err) { setError(err.message); return }
    setMensajes((data as Message[]) ?? [])

    // Marcar leída vía RPC: el cliente no tiene UPDATE sobre unread_count.
    const { error: rpcErr } = await supabase.rpc('wa_mark_read', { conv_id: id })
    if (!rpcErr) setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)))
  }

  // Realtime. Los setState viven dentro de callbacks de suscripción, que es
  // justamente el uso para el que existen los efectos.
  useEffect(() => {
    const canal = supabase
      .channel('wa:inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => { recargarConvs() })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [supabase, recargarConvs])

  useEffect(() => {
    if (!activa) return
    const canal = supabase
      .channel(`wa:conv:${activa}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wa_messages', filter: `conversation_id=eq.${activa}` },
        (payload) => setMensajes((prev) => {
          const nuevo = payload.new as Message
          return prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]
        }))
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [activa, supabase])

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes.length])

  async function enviar() {
    if (!conv || !borrador.trim()) return
    const texto = borrador.trim()
    const link = waLink(conv.phone_e164, texto)
    if (!link) { setError('El teléfono de la conversación no es válido.'); return }

    // window.open síncrono ANTES del await, o el navegador bloquea el popup.
    window.open(link, '_blank', 'noopener,noreferrer')
    setBorrador('')

    const { error: err } = await supabase.rpc('wa_log_deeplink', {
      p_phone: conv.phone_e164, p_body: texto, p_lead_id: conv.lead_id, p_template: null,
    })
    if (err) setError(`Se abrió WhatsApp pero no se registró el mensaje: ${err.message}`)
  }

  const filtradas = convs.filter((c) => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return [c.display_name, c.phone_e164, c.leads?.name, c.leads?.business_name]
      .filter(Boolean).some((f) => f!.toLowerCase().includes(q))
  })

  const sinLeer = convs.reduce((s, c) => s + c.unread_count, 0)
  const v = ventana(conv)

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">Inbox</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {convs.length} conversaciones
          {sinLeer > 0 && <span className="text-emerald-600 font-semibold"> · {sinLeer} sin leer</span>}
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-700">Error</p>
            <p className="text-xs text-red-600 mt-0.5 break-words font-mono">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0" aria-label="Cerrar">✕</button>
        </div>
      )}

      {!convs.some((c) => c.last_direction === 'in') && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800">
            <strong>Fase 0 — solo salientes.</strong> Podés escribir y queda registrado acá, pero el envío
            se hace abriendo WhatsApp. Para <em>recibir</em> dentro del CRM hay que conectar la Cloud API de Meta.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-280px)] min-h-[420px]">
        {/* ── Lista ── */}
        <div className={`bg-[var(--card)] rounded-2xl border border-[var(--border)] flex-col overflow-hidden ${activa ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-3 border-b border-[var(--border-light)]">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar conversación..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtradas.length === 0 ? (
              <div className="text-center py-14 px-4">
                <p className="text-3xl mb-3">💬</p>
                <p className="text-sm font-semibold text-[var(--dark)]">{busqueda ? 'Sin resultados' : 'Todavía no hay conversaciones'}</p>
                {!busqueda && <p className="text-xs text-[var(--text-muted)] mt-1.5">Escribile a un lead desde Pipeline y la conversación aparece acá.</p>}
              </div>
            ) : filtradas.map((c) => (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={`w-full text-left px-3.5 py-3 border-b border-[var(--border-light)] hover:bg-[var(--bg-alt)] transition-colors cursor-pointer ${activa === c.id ? 'bg-[var(--primary-glow)]' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm text-[var(--dark)] truncate">
                    {c.leads?.name || c.display_name || formatPhoneVE(c.phone_e164)}
                  </p>
                  <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{fechaRelativa(c.last_message_at)}</span>
                </div>
                {c.leads?.business_name && <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">{c.leads.business_name}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-[var(--text-muted)] truncate flex-1">
                    {c.last_direction === 'out' && <span>Vos: </span>}
                    {c.last_message_preview || 'Sin mensajes'}
                  </p>
                  {c.unread_count > 0 && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Hilo ── */}
        <div className={`bg-[var(--card)] rounded-2xl border border-[var(--border)] flex-col overflow-hidden ${activa ? 'flex' : 'hidden lg:flex'}`}>
          {!conv ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-[var(--text-muted)]">Elegí una conversación</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-[var(--border-light)] flex items-center gap-3">
                <button onClick={() => setActiva(null)} className="lg:hidden text-[var(--text-muted)] cursor-pointer text-lg" aria-label="Volver">←</button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[var(--dark)] truncate">
                    {conv.leads?.name || conv.display_name || formatPhoneVE(conv.phone_e164)}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono">{formatPhoneVE(conv.phone_e164)}</p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-lg font-semibold flex-shrink-0 ${v.abierta ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-[var(--bg-alt)] text-[var(--text-muted)] border border-[var(--border-light)]'}`}>
                  {v.texto}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[var(--bg)]">
                {mensajes.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-8">Sin mensajes todavía</p>}
                {mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${m.direction === 'out' ? 'bg-emerald-500 text-white rounded-br-md' : 'bg-white border border-[var(--border-light)] text-[var(--dark)] rounded-bl-md'}`}>
                      <p className="text-sm whitespace-pre-wrap break-words">{m.body || `[${m.msg_type}]`}</p>
                      <div className={`flex items-center gap-1.5 mt-1 ${m.direction === 'out' ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                        <span className="text-[10px]">{horaCorta(m.created_at)}</span>
                        {m.channel === 'deeplink' && <span className="text-[9px]" title="Enviado abriendo WhatsApp">↗</span>}
                        {m.status === 'failed' && <span className="text-[9px] text-red-300">falló</span>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={finRef} />
              </div>

              <div className="p-3 border-t border-[var(--border-light)]">
                <div className="flex gap-2 mb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {templatesForStage(conv.leads?.current_stage ?? 'nuevo').slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setBorrador(t.build({ nombre: conv.leads?.name, negocio: conv.leads?.business_name, plan: null, monto: null }))}
                      className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-[var(--border)] text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-alt)] cursor-pointer"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-end">
                  <textarea
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
                    rows={2}
                    placeholder="Escribí un mensaje... (Ctrl+Enter para enviar)"
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] resize-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    onClick={enviar}
                    disabled={!borrador.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold font-[Space_Grotesk,sans-serif] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
                  >
                    Abrir WA
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
