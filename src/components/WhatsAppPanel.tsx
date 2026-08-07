'use client'

import { useState, useMemo } from 'react'
import type { createClient } from '@/lib/supabase/client'
import {
  waLink,
  normalizePhoneVE,
  formatPhoneVE,
  templatesForStage,
  type TemplateVars,
} from '@/lib/whatsapp'

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
 * Fase 0 de WhatsApp: abre wa.me con el mensaje ya redactado y registra el
 * envío en el timeline del lead. Sin API de Meta, sin costo, sin esperar
 * aprobación de nadie.
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
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)

  const vars: TemplateVars = {
    nombre: lead.name,
    negocio: lead.business_name,
    plan: lead.plan_interested,
    monto: lead.amount_quoted,
  }

  const template = templates.find((t) => t.id === templateId) ?? templates[0]
  const message = edited ?? template?.build(vars) ?? ''
  const phoneOk = normalizePhoneVE(lead.phone) !== null

  async function logActivity(kind: string) {
    const { error: err } = await supabase.from('lead_activities').insert({
      lead_id: lead.id,
      activity_type: 'message',
      content: `${kind} · ${template?.label ?? 'mensaje'}: ${message.replace(/\s+/g, ' ').slice(0, 180)}`,
    })
    if (err) { setError(`Se abrió WhatsApp pero no se registró la actividad: ${err.message}`); return }
    setSent(true)
    onLogged?.()
  }

  function openWhatsApp() {
    setError(null)
    const link = waLink(lead.phone, message)
    if (!link) { setError('El teléfono del lead no es un móvil venezolano válido.'); return }
    // window.open va PRIMERO y de forma síncrona: si esperamos al insert, el
    // navegador ya no lo considera gesto del usuario y bloquea el popup.
    window.open(link, '_blank', 'noopener,noreferrer')
    void logActivity('Enviado por WhatsApp')
  }

  async function copyMessage() {
    setError(null)
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      void logActivity('Copiado')
    } catch {
      setError('No se pudo copiar al portapapeles.')
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.99 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider font-[Space_Grotesk,sans-serif]">
            WhatsApp
          </p>
        </div>
        <span className={`text-[10px] font-mono ${phoneOk ? 'text-emerald-600' : 'text-red-500'}`}>
          {phoneOk ? formatPhoneVE(lead.phone) : 'sin teléfono válido'}
        </span>
      </div>

      <select
        value={templateId}
        onChange={(e) => { setTemplateId(e.target.value); setEdited(null); setSent(false) }}
        className="w-full px-3 py-2 mb-2 rounded-lg border border-emerald-200 bg-white text-sm text-[var(--dark)] cursor-pointer"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>

      <textarea
        value={message}
        onChange={(e) => { setEdited(e.target.value); setSent(false) }}
        rows={6}
        className="w-full px-3 py-2.5 rounded-lg border border-emerald-200 bg-white text-sm text-[var(--dark)] resize-none leading-relaxed"
      />

      {edited !== null && (
        <button
          onClick={() => setEdited(null)}
          className="text-[10px] text-emerald-700 hover:underline cursor-pointer mt-1"
        >
          Restaurar plantilla
        </button>
      )}

      {error && (
        <p className="text-xs text-red-600 mt-2 break-words">{error}</p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={openWhatsApp}
          disabled={!phoneOk}
          className="flex-1 py-2.5 rounded-xl bg-[var(--green,#25D366)] bg-emerald-500 text-white text-sm font-semibold font-[Space_Grotesk,sans-serif] hover:brightness-110 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {sent ? 'Abrir de nuevo' : 'Abrir WhatsApp'}
        </button>
        <button
          onClick={copyMessage}
          className="px-4 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition-all cursor-pointer"
        >
          {copied ? '✓' : 'Copiar'}
        </button>
      </div>

      {!phoneOk && (
        <p className="text-[10px] text-[var(--text-muted)] mt-2">
          Carga el teléfono en la pestaña Datos (formato 0414-1234567) para habilitar el envío.
        </p>
      )}
      {sent && !error && (
        <p className="text-[10px] text-emerald-700 mt-2">Registrado en el timeline del lead ✓</p>
      )}
    </div>
  )
}
