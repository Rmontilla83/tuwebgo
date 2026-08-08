import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redactarBorrador, type ContextoLead, type TurnoConversacion } from '@/lib/gemini'

export const runtime = 'nodejs'

/**
 * POST /api/draft — redacta el borrador de la próxima respuesta.
 *
 * Vive en el servidor y no en el cliente por dos razones:
 *  1. GEMINI_API_KEY nunca debe llegar al navegador. Si fuera NEXT_PUBLIC_
 *     cualquiera la saca del bundle y gasta la cuota.
 *  2. Exigimos sesión de Supabase: sin esto el endpoint queda abierto a
 *     internet y es una factura esperando a pasar.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Falta GEMINI_API_KEY en las variables de entorno del proyecto.' },
      { status: 503 }
    )
  }

  let body: {
    lead?: ContextoLead
    conversacion?: TurnoConversacion[]
    instruccion?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const conversacion = Array.isArray(body.conversacion) ? body.conversacion : []

  // Acotamos lo que se manda: últimos 20 turnos y 1200 caracteres por turno.
  // Un hilo largo dispara el costo y aporta poco — lo que importa es el final.
  const recorte = conversacion.slice(-20).map((t) => ({
    autor: t.autor === 'rafael' ? ('rafael' as const) : ('cliente' as const),
    texto: String(t.texto ?? '').slice(0, 1200),
  }))

  try {
    const { texto, tokensIn, tokensOut, modelo } = await redactarBorrador({
      apiKey,
      modelo: process.env.GEMINI_MODEL,
      lead: body.lead ?? {},
      conversacion: recorte,
      instruccionExtra: body.instruccion?.slice(0, 500),
    })
    // El botón Sugerir cuesta igual que una respuesta automática.
    await createAdminClient().from('ia_uso').insert({
      modelo, contexto: 'borrador', tokens_in: tokensIn, tokens_out: tokensOut,
    })

    return NextResponse.json({ texto, tokens: tokensOut })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    console.error('[api/draft]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
