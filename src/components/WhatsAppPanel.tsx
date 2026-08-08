'use client'

import { useState, useMemo } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { normalizePhoneVE, formatPhoneVE, templatesForStage, waLink, type TemplateVars } from '@/lib/whatsapp'
import { IconWhatsApp, IconCheck, IconAsistente } from '@/components/icons'

type LeadLike = {
  id: string
  name: string | null
  phone: string | null
  business_name: string | null
  plan_interested: string | null
  amount_quoted: number | null
  current_stage: string
}

/**
 * Enviar por WhatsApp desde la ficha del lead.
 *
 * Antes esto SIEMPRE abría WhatsApp Web, incluso cuando el cliente había
 * escrito hace 10 minutos y se le podía responder por la API. Ahora intenta la
 * API primero y solo cae al deep-link cuando de verdad no hay otra:
 *
 *   · Ventana de 24h abierta  → sale por la Cloud API y aparece en el Inbox
 *   · Ventana cerrada (409)   → abre WhatsApp, porque Meta rechaza texto libre
 *   · Sin credenciales (503)  → abre WhatsApp
 *
 * El deep-link deja de ser el camino y pasa a ser el paracaídas.
 */
export default function WhatsAppPanel({
  lead,
  supabase,
  onLogged,
}: {
  lead: LeadLike
  supabase: ReturnType<typeof createClient>
  onLogged?: () => void
}) {
  const templates = useMemo(() => templatesForStage(lead.current_stage), [lead.current_stage])
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [edited, setEdited] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<'api' | 'deeplink' | null>(null)
  const [enviando, setEnviando] = useState(false)

  const vars: TemplateVars = {
    nombre: lead.name,
    negocio: lead.business_name,
    plan: lead.plan_interested,
    monto: lead.amount_quoted,
  }

  const template = templates.find((t) => t.id === templateId) ?? templates[0]
  const message = edited ?? template?.build(vars) ?? ''
  const phoneOk = normalizePhoneVE(lead.phone) !== null

  /** Paracaídas: abre WhatsApp y deja constancia en el hilo. */
  async function porDeeplink(texto: string) {
    const link = waLink(lead.phone, texto)
    if (!link) { setError('El teléfono del lead no es válido.'); return }
    // window.open síncrono: si esperamos un await, el navegador bloquea el popup.
    window.open(link, '_blank', 'noopener,noreferrer')
    setResultado('deeplink')
    const { error: err } = await supabase.rpc('wa_log_deeplink', {
      p_phone: lead.phone, p_body: texto, p_lead_id: lead.id, p_template: template?.id ?? null,
    })
    if (err) setError(`Se abrió WhatsApp pero no quedó registrado: ${err.message}`)
    onLogged?.()
  }

  // registrarActividad eliminado: escribía una copia degradada del mensaje en
  // lead_activities mientras el texto completo ya quedaba en wa_messages. Eran
  // dos historiales contradictorios — 101 mensajes reales contra 3 actividades.
  // wa_messages es la fuente única; lead_activities queda para notas, llamadas
  // y tareas, que no viven en ningún otro lado.

  async function enviar() {
    if (!message.trim() || enviando) return
    setError(null); setResultado(null); setEnviando(true)
    const texto = message.trim()

    try {
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: lead.phone, leadId: lead.id, texto }),
      })
      const data = await res.json()

      if (res.ok) {
        setResultado('api')
        if (data.aviso) setError(data.aviso)
        onLogged?.()
        return
      }

      // 409 = ventana de 24h cerrada · 503 = faltan credenciales de Meta.
      // En ambos casos el deep-link sigue sirviendo.
      if (res.status === 409 || res.status === 503 || data.codigo === 'VENTANA_CERRADA') {
        await porDeeplink(texto)
        return
      }
      setError(data.error ?? `Error ${res.status}`)
    } catch {
      setError('No se pudo conectar. Intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-emerald-700">
          <IconWhatsApp className="w-4 h-4" />
          <p className="text-[10px] font-bold uppercase tracking-wider font-[family-name:var(--font-display)]">WhatsApp</p>
        </div>
        <span className={`text-[10px] font-mono ${phoneOk ? 'text-emerald-600' : 'text-red-500'}`}>
          {phoneOk ? formatPhoneVE(lead.phone) : 'sin teléfono válido'}
        </span>
      </div>

      <select
        value={templateId}
        onChange={(e) => { setTemplateId(e.target.value); setEdited(null); setResultado(null) }}
        className="w-full px-3 py-2 mb-2 rounded-lg border border-emerald-200 bg-white text-sm text-[var(--dark)] cursor-pointer"
      >
        {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      <textarea
        value={message}
        onChange={(e) => { setEdited(e.target.value); setResultado(null) }}
        rows={6}
        className="w-full px-3 py-2.5 rounded-lg border border-emerald-200 bg-white text-sm text-[var(--dark)] resize-none leading-relaxed"
      />

      {edited !== null && (
        <button onClick={() => setEdited(null)} className="text-[10px] text-emerald-700 hover:underline cursor-pointer mt-1">
          Restaurar plantilla
        </button>
      )}

      {error && <p className="text-xs text-red-600 mt-2 break-words">{error}</p>}

      <button
        onClick={enviar}
        disabled={!phoneOk || enviando}
        className="w-full mt-3 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold font-[family-name:var(--font-display)] hover:brightness-110 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
      >
        {enviando ? 'Enviando…' : 'Enviar mensaje'}
      </button>

      {resultado === 'api' && (
        <p className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1">
          <IconCheck className="w-3 h-3" />
          Enviado por la API. Podés seguir la conversación en Inbox.
        </p>
      )}
      {resultado === 'deeplink' && (
        <p className="text-[11px] text-[var(--text-secondary)] mt-2">
          La ventana de 24h está cerrada, así que se abrió WhatsApp para que lo mandes vos.
          Queda registrado igual en el Inbox.
        </p>
      )}

      {!phoneOk ? (
        <p className="text-[10px] text-[var(--text-muted)] mt-2">
          Cargá el teléfono en la pestaña Datos para habilitar el envío.
        </p>
      ) : (
        <p className="text-[10px] text-[var(--text-muted)] mt-2 flex items-start gap-1">
          <IconAsistente className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>Si el cliente responde, Sofía sigue la conversación sola desde el Inbox.</span>
        </p>
      )}
    </div>
  )
}
