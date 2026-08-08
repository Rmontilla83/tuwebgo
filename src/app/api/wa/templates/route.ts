import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PLANTILLAS, aFormatoMeta } from '@/lib/waTemplates'

export const runtime = 'nodejs'

const GRAPH = process.env.GRAPH_API_VERSION || 'v26.0'

function credenciales() {
  const token = process.env.WHATSAPP_TOKEN
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  return token && waba ? { token, waba } : null
}

async function exigirSesion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/* ── GET: estado actual de las plantillas en Meta ── */
export async function GET() {
  if (!(await exigirSesion())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cred = credenciales()
  if (!cred) return NextResponse.json({ error: 'Faltan WHATSAPP_TOKEN o WHATSAPP_BUSINESS_ACCOUNT_ID.' }, { status: 503 })

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH}/${cred.waba}/message_templates?fields=name,status,category,language,rejected_reason,quality_score,id&limit=100`,
      { headers: { Authorization: `Bearer ${cred.token}` }, cache: 'no-store' }
    )
    const datos = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: datos?.error?.message ?? `HTTP ${res.status}` }, { status: 502 })
    }
    const lista = datos.data ?? []
    return NextResponse.json({
      plantillas: lista,
      // Si Meta no devuelve NINGUNA, es que nunca llegaron — no que estén en
      // revisión. Distinguir esos dos casos ahorra días de espera inútil.
      ningunaRegistrada: lista.length === 0,
    })
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar a Meta.' }, { status: 502 })
  }
}

/* ── POST: sube las que falten ── */
export async function POST() {
  if (!(await exigirSesion())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cred = credenciales()
  if (!cred) return NextResponse.json({ error: 'Faltan WHATSAPP_TOKEN o WHATSAPP_BUSINESS_ACCOUNT_ID.' }, { status: 503 })

  const resultados: { name: string; estado: string; detalle?: string }[] = []

  // Secuencial a propósito: Meta limita la creación de plantillas y en paralelo
  // devuelve errores de rate limit que parecen rechazos de contenido.
  for (const p of PLANTILLAS) {
    try {
      const res = await fetch(`https://graph.facebook.com/${GRAPH}/${cred.waba}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(aFormatoMeta(p)),
      })
      const datos = await res.json().catch(() => ({}))

      if (res.ok) {
        resultados.push({ name: p.name, estado: 'enviada', detalle: datos?.status ?? 'PENDING' })
        continue
      }

      const msg: string = datos?.error?.error_user_msg ?? datos?.error?.message ?? `HTTP ${res.status}`
      // Meta usa 2388023 / "already exists" cuando el nombre está tomado.
      const yaExiste = /already exists|ya existe/i.test(msg) || datos?.error?.code === 2388023
      resultados.push({ name: p.name, estado: yaExiste ? 'ya_existia' : 'error', detalle: msg })
    } catch (e) {
      resultados.push({ name: p.name, estado: 'error', detalle: e instanceof Error ? e.message : 'Error de red' })
    }
  }

  return NextResponse.json({
    resultados,
    enviadas: resultados.filter((r) => r.estado === 'enviada').length,
    yaExistian: resultados.filter((r) => r.estado === 'ya_existia').length,
    errores: resultados.filter((r) => r.estado === 'error').length,
  })
}
