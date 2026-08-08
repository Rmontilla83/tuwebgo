'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatPhoneVE, templatesForStage, waLink } from '@/lib/whatsapp'
import { PLANTILLAS, previsualizar, type PlantillaWA } from '@/lib/waTemplates'
import { ICONO_HANDOFF, IconChat, IconCerrar, IconAsistente, IconUsuario, IconMano, IconFlecha, IconEnlaceExterno } from '@/components/icons'

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
  bot_activo: boolean
  handoff_motivo: string | null
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
  por_bot: boolean
  created_at: string
}

const MOTIVO_LEGIBLE: Record<string, string> = {
  quiere_comprar: 'El cliente quiere comprar — te toca cerrar',
  queja: 'Reclamo — atendelo vos',
  fuera_de_alcance: 'Pidió algo fuera del catálogo',
  pide_humano: 'Pidió hablar con una persona',
}

/** Versión corta para la lista, donde el espacio es poco. */
const ETIQUETA_CORTA: Record<string, string> = {
  quiere_comprar: 'Quiere comprar',
  queja: 'Reclamo',
  fuera_de_alcance: 'Fuera de catálogo',
  pide_humano: 'Pidió una persona',
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

export type Etapa = { slug: string; label: string; sort_order: number }

export default function InboxClient({ initial, etapas = [] }: { initial: Conversation[]; etapas?: Etapa[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [convs, setConvs] = useState<Conversation[]>(initial)
  const [activa, setActiva] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [redactando, setRedactando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [rt, setRt] = useState<'conectando' | 'ok' | 'error' | 'sin-sesion'>('conectando')
  const finRef = useRef<HTMLDivElement>(null)
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // El callback de Realtime se registra una sola vez y necesita leer la
  // conversación abierta actual, no la que había cuando se suscribió.
  const activaRef = useRef<string | null>(null)
  useEffect(() => { activaRef.current = activa }, [activa])

  const conv = convs.find((c) => c.id === activa) ?? null

  // Una conversación ahora tiene URL: ?conv=<id> o ?tel=<e164>. Sin esto no se
  // podía enlazar desde el Dashboard ni desde una tarjeta del Pipeline, y no
  // había forma de mandarle a alguien "mirá esta conversación".
  const params = useSearchParams()
  useEffect(() => {
    if (activa) return
    const porId = params.get('conv')
    const porTel = params.get('tel')
    const objetivo = porId
      ? convs.find((c) => c.id === porId)
      : porTel ? convs.find((c) => c.phone_e164 === porTel) : null
    if (objetivo) abrir(objetivo.id)
    // abrir() no va en deps a propósito: se recrea en cada render y dispararía
    // un bucle. Solo interesa correr esto cuando cambian la URL o la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, convs, activa])

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

  /**
   * Realtime.
   *
   * CRÍTICO: con RLS activa hay que pasarle el JWT al socket ANTES de
   * suscribir. Sin `realtime.setAuth()` el socket se conecta como `anon`, la
   * RLS de wa_messages (SELECT solo para authenticated) filtra todo, y no
   * llega ni un evento — sin ningún error visible. Ese era el motivo de que el
   * inbox no se actualizara en vivo.
   *
   * Además hay que reaplicarlo cuando Supabase refresca el token (~1h), o la
   * conexión se queda muda a la hora de estar abierta.
   */
  useEffect(() => {
    let cancelado = false

    const aplicarAuth = async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) await supabase.realtime.setAuth(token)
      return !!token
    }

    const arrancar = async () => {
      const hayToken = await aplicarAuth()
      if (cancelado) return
      if (!hayToken) { setRt('sin-sesion'); return }

      const canal = supabase
        .channel('wa:inbox')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => { recargarConvs() })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, (payload) => {
          const nuevo = payload.new as Message
          // Un solo canal para todo: filtramos en cliente por la conversación
          // abierta. Menos sockets y no hay que resuscribir al cambiar de hilo.
          setMensajes((prev) =>
            nuevo.conversation_id === activaRef.current && !prev.some((m) => m.id === nuevo.id)
              ? [...prev, nuevo]
              : prev
          )
        })
        .subscribe((estado) => {
          if (cancelado) return
          if (estado === 'SUBSCRIBED') setRt('ok')
          else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') setRt('error')
          else if (estado === 'CLOSED') setRt('conectando')
        })

      canalRef.current = canal
    }

    arrancar()

    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'TOKEN_REFRESHED' || evento === 'SIGNED_IN') aplicarAuth()
    })

    return () => {
      cancelado = true
      sub.subscription.unsubscribe()
      if (canalRef.current) supabase.removeChannel(canalRef.current)
    }
  }, [supabase, recargarConvs])

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes.length])

  /**
   * Red de seguridad: sondeo cada 8 segundos.
   *
   * Realtime sigue siendo el camino principal —es instantáneo—, pero depende de
   * un websocket que puede caerse por red, proxy, suspensión del equipo o un
   * token vencido, y cuando falla lo hace en silencio. Un inbox que a veces no
   * muestra los mensajes es peor que uno que tarda 8 segundos siempre.
   *
   * Se pausa con la pestaña oculta para no gastar cuota de fondo.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const sondear = async () => {
      if (document.visibilityState !== 'visible') return
      await recargarConvs()

      const abierta = activaRef.current
      if (!abierta) return
      const { data, error: err } = await supabase
        .from('wa_messages').select('*').eq('conversation_id', abierta)
        .order('created_at', { ascending: true }).range(0, 199)
      if (err || !data) return
      // Solo tocamos el estado si de verdad cambió, para no re-renderizar
      // ni romper el scroll cada 8 segundos.
      setMensajes((prev) => (prev.length === data.length && prev.at(-1)?.id === (data as Message[]).at(-1)?.id
        ? prev
        : (data as Message[])))
    }

    const arrancar = () => { if (!timer) timer = setInterval(sondear, 8000) }
    const parar = () => { if (timer) { clearInterval(timer); timer = null } }
    const onVis = () => { if (document.visibilityState === 'visible') { sondear(); arrancar() } else parar() }

    arrancar()
    document.addEventListener('visibilitychange', onVis)
    return () => { parar(); document.removeEventListener('visibilitychange', onVis) }
  }, [supabase, recargarConvs])

  /** Alterna quién atiende: Sofía o Rafael. */
  async function alternarBot(c: Conversation) {
    const activar = !c.bot_activo
    setConvs((prev) => prev.map((x) => (x.id === c.id ? { ...x, bot_activo: activar, handoff_motivo: activar ? null : x.handoff_motivo } : x)))

    const { error: err } = activar
      ? await supabase.rpc('wa_reactivar_bot', { p_conv_id: c.id })
      : await supabase.rpc('wa_handoff', { p_conv_id: c.id, p_motivo: 'Rafael tomó el control' })

    if (err) {
      setError(`No se pudo cambiar quién atiende: ${err.message}`)
      setConvs((prev) => prev.map((x) => (x.id === c.id ? { ...x, bot_activo: c.bot_activo, handoff_motivo: c.handoff_motivo } : x)))
    }
  }

  /** Pide a Gemini el borrador. Útil cuando vos estás atendiendo y querés ayuda. */
  async function sugerir() {
    if (!conv || redactando) return
    setRedactando(true)
    setError(null)
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: {
            nombre: conv.leads?.name,
            negocio: conv.leads?.business_name,
            etapa: conv.leads?.current_stage,
          },
          conversacion: mensajes.map((m) => ({
            autor: m.direction === 'out' ? 'rafael' : 'cliente',
            texto: m.body ?? `[${m.msg_type}]`,
          })),
          instruccion: borrador.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return }
      setBorrador(data.texto)
    } catch {
      setError('No se pudo conectar con el asistente.')
    } finally {
      setRedactando(false)
    }
  }

  /** Abre wa.me y deja constancia. Respaldo para cuando la Cloud API no puede enviar. */
  async function enviarPorDeeplink(texto: string) {
    const link = waLink(conv!.phone_e164, texto)
    if (!link) { setError('El teléfono de la conversación no es válido.'); return }
    // window.open síncrono ANTES del await, o el navegador bloquea el popup.
    window.open(link, '_blank', 'noopener,noreferrer')
    const { error: err } = await supabase.rpc('wa_log_deeplink', {
      p_phone: conv!.phone_e164, p_body: texto, p_lead_id: conv!.lead_id, p_template: null,
    })
    if (err) setError(`Se abrió WhatsApp pero no se registró el mensaje: ${err.message}`)
  }

  /** Envía una plantilla aprobada. Es la única vía fuera de la ventana de 24h. */
  async function enviarPlantilla(p: PlantillaWA) {
    if (!conv || enviando) return
    setError(null); setEnviando(true)
    try {
      // Los ejemplos de la plantilla se sustituyen por los datos reales del lead.
      const params = p.ejemplos.map((_, i) =>
        i === 0
          ? (conv.leads?.name?.split(/\s+/)[0] ?? 'Hola')
          : (conv.leads?.business_name ?? 'tu negocio')
      )
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conv.id, plantilla: { name: p.name, params } }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return }
      if (data.aviso) setError(data.aviso)
    } catch {
      setError('No se pudo enviar la plantilla.')
    } finally { setEnviando(false) }
  }

  /** Mueve el lead de etapa sin salir de la conversación. */
  async function cambiarEtapa(slug: string) {
    if (!conv?.lead_id) return
    const anterior = conv.leads?.current_stage
    setConvs((prev) => prev.map((c) =>
      c.id === conv.id && c.leads ? { ...c, leads: { ...c.leads, current_stage: slug } } : c))

    const { error: err } = await supabase.from('leads').update({ current_stage: slug }).eq('id', conv.lead_id)
    if (err) {
      setError(`No se pudo cambiar la etapa: ${err.message}`)
      setConvs((prev) => prev.map((c) =>
        c.id === conv.id && c.leads && anterior ? { ...c, leads: { ...c.leads, current_stage: anterior } } : c))
    }
  }

  async function enviar() {
    if (!conv || !borrador.trim() || enviando) return
    const texto = borrador.trim()
    setError(null)

    // Sin ventana abierta la API rechaza el texto libre, así que ni lo intentamos.
    if (!v.abierta) {
      setBorrador('')
      await enviarPorDeeplink(texto)
      return
    }

    setEnviando(true)
    try {
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conv.id, texto }),
      })
      const data = await res.json()

      if (res.ok) {
        setBorrador('')
        if (data.aviso) setError(data.aviso)
        return
      }

      // 503 = faltan credenciales de Meta · 409 = ventana cerrada.
      // En ambos casos el deep-link sigue funcionando, así que no te quedas trancado.
      if (res.status === 503 || data.codigo === 'VENTANA_CERRADA') {
        setBorrador('')
        await enviarPorDeeplink(texto)
        return
      }
      setError(data.error ?? `Error ${res.status}`)
    } catch {
      setError('No se pudo conectar. Intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const pendientesHumano = convs.filter((c) => !c.bot_activo && c.handoff_motivo).length

  const filtradas = convs.filter((c) => {
    if (soloPendientes && !(!c.bot_activo && c.handoff_motivo)) return false
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return [c.display_name, c.phone_e164, c.leads?.name, c.leads?.business_name]
      .filter(Boolean).some((f) => f!.toLowerCase().includes(q))
  })

  const sinLeer = convs.reduce((s, c) => s + c.unread_count, 0)
  const v = ventana(conv)

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[family-name:var(--font-display)] tracking-tight">Inbox</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {convs.length} conversaciones
            {sinLeer > 0 && <span className="text-emerald-600 font-semibold"> · {sinLeer} sin leer</span>}
          </p>
        </div>
        <button
          onClick={() => recargarConvs()}
          title={
            rt === 'ok' ? 'Conectado en vivo — los mensajes entran solos'
            : rt === 'error' ? 'Se perdió la conexión en vivo. Tocá para recargar.'
            : rt === 'sin-sesion' ? 'Sin sesión activa. Volvé a entrar.'
            : 'Conectando…'
          }
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-alt)] cursor-pointer flex-shrink-0"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${
            rt === 'ok' ? 'bg-emerald-500'
            : rt === 'error' || rt === 'sin-sesion' ? 'bg-red-500'
            : 'bg-amber-400 animate-pulse'
          }`} />
          {rt === 'ok' ? 'En vivo' : rt === 'error' ? 'Desconectado' : rt === 'sin-sesion' ? 'Sin sesión' : 'Conectando'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-700">Error</p>
            <p className="text-xs text-red-600 mt-0.5 break-words font-mono">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0" aria-label="Cerrar"><IconCerrar className="w-4 h-4" /></button>
        </div>
      )}


      <div className="grid lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-280px)] min-h-[420px]">
        {/* ── Lista ── */}
        <div className={`bg-[var(--card)] rounded-2xl border border-[var(--border)] flex-col overflow-hidden ${activa ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-3 border-b border-[var(--border-light)] space-y-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar conversación..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] placeholder:text-[var(--text-muted)]"
            />
            {pendientesHumano > 0 && (
              <button
                onClick={() => setSoloPendientes(!soloPendientes)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  soloPendientes
                    ? 'bg-amber-400 text-amber-950 border-amber-500'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                {soloPendientes
                  ? `Viendo solo las ${pendientesHumano} que te esperan · Ver todas`
                  : `${pendientesHumano} ${pendientesHumano === 1 ? 'conversación te espera' : 'conversaciones te esperan'}`}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtradas.length === 0 ? (
              <div className="text-center py-14 px-4">
                <IconChat className="w-9 h-9 mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.4} />
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

                {/* Sofía se apartó: acá hay algo que solo vos podés resolver */}
                {!c.bot_activo && c.handoff_motivo && (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-semibold border border-amber-300">
                    {(() => { const I = ICONO_HANDOFF[c.handoff_motivo!] ?? IconMano; return <><I className="w-3 h-3" />{ETIQUETA_CORTA[c.handoff_motivo!] ?? 'Te toca a vos'}</> })()}
                  </span>
                )}
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
                <button onClick={() => setActiva(null)} className="lg:hidden text-[var(--text-muted)] cursor-pointer text-lg" aria-label="Volver"><IconFlecha className="w-5 h-5 rotate-180" /></button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[var(--dark)] truncate">
                    {conv.leads?.name || conv.display_name || formatPhoneVE(conv.phone_e164)}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-[var(--text-muted)] font-mono">{formatPhoneVE(conv.phone_e164)}</p>
                    {/* Inbox y Pipeline eran dos islas sin ida ni vuelta */}
                    {conv.lead_id && (
                      <Link href={`/dashboard/pipeline?lead=${conv.lead_id}`}
                        className="text-[11px] text-[var(--primary)] hover:underline flex-shrink-0">
                        Ver ficha
                      </Link>
                    )}
                  </div>
                </div>
                <span className={`hidden sm:inline text-[10px] px-2 py-1 rounded-lg font-semibold flex-shrink-0 ${v.abierta ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-[var(--bg-alt)] text-[var(--text-muted)] border border-[var(--border-light)]'}`}>
                  {v.texto}
                </span>
                <button
                  onClick={() => alternarBot(conv)}
                  title={conv.bot_activo ? 'Sofía está atendiendo. Tocá para tomar el control.' : 'Vos estás atendiendo. Tocá para que Sofía siga.'}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold flex-shrink-0 border cursor-pointer transition-all ${
                    conv.bot_activo
                      ? 'bg-[var(--primary-glow)] text-[var(--primary)] border-[var(--primary)]/30'
                      : 'bg-[var(--bg-alt)] text-[var(--text-muted)] border-[var(--border)]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">{conv.bot_activo ? <IconAsistente className="w-3.5 h-3.5" /> : <IconUsuario className="w-3.5 h-3.5" />}{conv.bot_activo ? 'Sofía' : 'Vos'}</span>
                </button>
              </div>

              {/* Etapa del lead, editable sin salir de la conversación */}
              {conv.lead_id && etapas.length > 0 && (
                <div className="px-4 py-2 border-b border-[var(--border-light)] flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex-shrink-0">Etapa</span>
                  {etapas.map((e) => {
                    const activa = conv.leads?.current_stage === e.slug
                    return (
                      <button
                        key={e.slug}
                        onClick={() => cambiarEtapa(e.slug)}
                        className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          activa
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                            : 'bg-[var(--bg-alt)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40'
                        }`}
                      >
                        {e.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Traspaso: el bot se apartó y hay algo que atender */}
              {!conv.bot_activo && conv.handoff_motivo && (
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                  <p className="text-xs text-amber-800 flex-1 min-w-0">
                    {MOTIVO_LEGIBLE[conv.handoff_motivo] ?? conv.handoff_motivo}
                  </p>
                  <button
                    onClick={() => alternarBot(conv)}
                    className="text-[10px] font-semibold text-amber-800 underline cursor-pointer flex-shrink-0"
                  >
                    Devolver a Sofía
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[var(--bg)]">
                {mensajes.length === 0 && <p className="text-xs text-[var(--text-muted)] text-center py-8">Sin mensajes todavía</p>}
                {mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                      m.direction !== 'out'
                        ? 'bg-white border border-[var(--border-light)] text-[var(--dark)] rounded-bl-md'
                        : m.por_bot
                          ? 'bg-[var(--primary)] text-white rounded-br-md'   // Sofía: índigo
                          : 'bg-emerald-500 text-white rounded-br-md'        // Rafael: verde
                    }`}>
                      {m.direction === 'out' && m.por_bot && (
                        <p className="text-[9px] font-semibold text-white/70 mb-0.5 inline-flex items-center gap-1"><IconAsistente className="w-3 h-3" />Sofía</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{m.body || `[${m.msg_type}]`}</p>
                      <div className={`flex items-center gap-1.5 mt-1 ${m.direction === 'out' ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>
                        <span className="text-[10px]">{horaCorta(m.created_at)}</span>
                        {m.channel === 'deeplink' && <IconEnlaceExterno className="w-2.5 h-2.5" />}
                        {m.status === 'failed' && <span className="text-[9px] text-red-200">falló</span>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={finRef} />
              </div>

              <div className="p-3 border-t border-[var(--border-light)]">
                {/* Fuera de la ventana de 24h, Meta solo acepta plantillas aprobadas.
                    En vez de bloquear el envío, ofrecemos las que hay. */}
                {!v.abierta && (
                  <div className="mb-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-[11px] text-amber-900 mb-2">
                      Pasaron más de 24 horas desde su último mensaje. Meta solo permite plantillas aprobadas.
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {PLANTILLAS.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => enviarPlantilla(p)}
                          disabled={enviando}
                          title={previsualizar(p)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 cursor-pointer transition-all"
                        >
                          {p.proposito}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-amber-800/70 mt-1.5">
                      Si no está aprobada todavía, Meta la rechaza y te lo digo acá.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 mb-2 overflow-x-auto items-center" style={{ scrollbarWidth: 'none' }}>
                  <button
                    onClick={sugerir}
                    disabled={redactando}
                    title="Gemini redacta el borrador con el contexto del lead y la conversación. Lo revisás y lo mandás vos."
                    className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--primary)] text-white text-[11px] font-semibold hover:bg-[var(--primary-light)] disabled:opacity-50 disabled:cursor-wait cursor-pointer transition-all"
                  >
                    {redactando ? (
                      <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />Redactando…</>
                    ) : (
                      <><IconAsistente className="w-3 h-3" />Sugerir{borrador.trim() && ' con mi indicación'}</>
                    )}
                  </button>
                  <span className="flex-shrink-0 w-px h-4 bg-[var(--border)]" />
                  {templatesForStage(conv.leads?.current_stage ?? 'conversando').slice(0, 4).map((t) => (
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
                    disabled={!borrador.trim() || enviando}
                    title={v.abierta ? 'Se envía por la API de WhatsApp' : 'Ventana cerrada: se abre WhatsApp para que lo mandes vos'}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold font-[family-name:var(--font-display)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] whitespace-nowrap"
                  >
                    {enviando ? 'Enviando…' : v.abierta ? 'Enviar' : 'Abrir WA'}
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
