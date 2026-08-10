import { render, texto, type Correo } from '@/lib/email/plantilla'

/**
 * El envío por Resend.
 *
 * Regla que atraviesa todo este archivo: **un correo que falla no puede
 * tumbar lo que lo disparó.** Estos avisos cuelgan del webhook de WhatsApp,
 * del guardado del brief y del envío de campañas. Si Resend está caído, o se
 * acabó la cuota, o el dominio se cayó de verificado, lo que NO puede pasar
 * es que se pierda el mensaje del cliente o que el brief no se guarde. Por
 * eso `enviarCorreo` no lanza nunca: devuelve si pudo o no y lo registra.
 *
 * El dominio tuwebgo.net está verificado en Resend (comprobado 2026-08-10).
 * Ojo: esa cuenta es COMPARTIDA con los otros negocios de Rafael —fortius,
 * wuipi, atryum y varios más—, igual que la de Stripe. Por eso el remitente
 * lleva el dominio propio y el asunto la marca: en el panel de Resend, los
 * envíos de TuWebGo tienen que distinguirse de un vistazo.
 */

const API = 'https://api.resend.com/emails'

/** De dónde salen los correos. Buzón real del dominio verificado. */
export const REMITENTE = 'TuWebGo <hola@tuwebgo.net>'

/** A dónde van los avisos internos. No son secretos: son los dueños del negocio. */
export const EQUIPO = ['rafaelmontilla8@gmail.com', 'Jodanymonasterio@gmail.com']

export type Resultado = { ok: true; id: string } | { ok: false; motivo: string }

export async function enviarCorreo(opts: {
  para: string | string[]
  asunto: string
  correo: Correo
  /** Para agrupar en el panel de Resend y poder filtrar. */
  etiqueta?: string
  responderA?: string
}): Promise<Resultado> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('[email] falta RESEND_API_KEY — no se envió:', opts.asunto)
    return { ok: false, motivo: 'Falta RESEND_API_KEY' }
  }

  const para = (Array.isArray(opts.para) ? opts.para : [opts.para]).filter(Boolean)
  if (!para.length) return { ok: false, motivo: 'Sin destinatarios' }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: para,
        subject: opts.asunto,
        html: render(opts.correo),
        text: texto(opts.correo),
        ...(opts.responderA ? { reply_to: opts.responderA } : {}),
        // Las etiquetas de Resend solo aceptan letras, números, guiones y
        // guiones bajos. Un valor con acento o espacio hace fallar el envío
        // entero, así que se limpia acá y no se confía en quien llama.
        ...(opts.etiqueta
          ? { tags: [{ name: 'tipo', value: opts.etiqueta.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) }] }
          : {}),
      }),
    })

    const datos = await res.json().catch(() => ({}))
    if (!res.ok) {
      const motivo = datos?.message ?? datos?.error?.message ?? `HTTP ${res.status}`
      console.error('[email] Resend rechazó:', opts.asunto, motivo)
      return { ok: false, motivo: String(motivo) }
    }
    return { ok: true, id: String(datos?.id ?? '') }
  } catch (e) {
    // Se traga el error a propósito: ver la nota de arriba.
    const motivo = e instanceof Error ? e.message : 'Error de red'
    console.error('[email] no se pudo enviar:', opts.asunto, motivo)
    return { ok: false, motivo }
  }
}
