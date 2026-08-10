import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { firmarTokenManual } from '@/lib/briefManual'
import { urlFormulario } from '@/lib/pagos'

export const runtime = 'nodejs'

/**
 * POST /api/brief/enlace — un enlace del formulario para un cliente que no
 * llegó por WhatsApp.
 *
 * Va con sesión, al revés que `/api/brief`, que es público a propósito. Acá
 * se FIRMA el token, y quien pueda pedir enlaces a voluntad puede repartir
 * accesos al formulario: eso es del portal, no del que llena.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let cuerpo: { etiqueta?: string; dias?: number } = {}
  try { cuerpo = await request.json() } catch { /* sin cuerpo es válido */ }

  const dias = Math.min(Math.max(Number(cuerpo.dias) || 30, 1), 90)

  try {
    const token = firmarTokenManual(cuerpo.etiqueta ?? '', dias)
    return NextResponse.json({
      url: urlFormulario(token),
      vence: new Date(Date.now() + dias * 86400_000).toISOString(),
    })
  } catch (e) {
    console.error('[api/brief/enlace]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'No se pudo generar el enlace' }, { status: 500 })
  }
}
