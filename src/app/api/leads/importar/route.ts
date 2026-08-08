import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhoneVE } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const maxDuration = 60

type Fila = { nombre?: string; telefono?: string; negocio?: string; notas?: string }

/**
 * Importa contactos scrapeados como leads.
 *
 * Entran en 'sin_contactar' — no en 'conversando' — porque nunca hablaron con
 * nadie. Meterlos como si estuvieran en conversación infla el pipeline y hace
 * que el forecast mienta.
 *
 * Deduplica por teléfono normalizado ANTES de insertar: el mismo negocio suele
 * aparecer repetido entre scrapings, y un duplicado significa mandarle dos
 * veces la misma campaña — la forma más rápida de que alguien reporte el número.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { filas?: Fila[]; canal?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const filas = Array.isArray(body.filas) ? body.filas : []
  if (!filas.length) return NextResponse.json({ error: 'No hay filas para importar' }, { status: 400 })
  if (filas.length > 5000) {
    return NextResponse.json({ error: 'Máximo 5.000 filas por importación.' }, { status: 400 })
  }

  const db = createAdminClient()

  // ── Normalizar y descartar lo que no sirve ──
  const validas: { phone_e164: string; fila: Fila }[] = []
  const vistos = new Set<string>()
  let sinTelefono = 0, duplicadosEnArchivo = 0

  for (const f of filas) {
    const e164 = normalizePhoneVE(f.telefono)
    if (!e164) { sinTelefono++; continue }
    if (vistos.has(e164)) { duplicadosEnArchivo++; continue }
    vistos.add(e164)
    validas.push({ phone_e164: e164, fila: f })
  }

  if (!validas.length) {
    return NextResponse.json({
      importados: 0, sinTelefono, duplicadosEnArchivo, yaExistian: 0,
      mensaje: 'Ninguna fila tenía un móvil válido.',
    })
  }

  // ── Qué teléfonos ya están en la base ──
  const yaEnBase = new Set<string>()
  for (let i = 0; i < validas.length; i += 500) {
    const lote = validas.slice(i, i + 500).map((v) => v.phone_e164)
    const { data } = await db.from('leads').select('phone_e164').in('phone_e164', lote)
    for (const r of data ?? []) if (r.phone_e164) yaEnBase.add(r.phone_e164)
  }

  const aInsertar = validas.filter((v) => !yaEnBase.has(v.phone_e164))

  let importados = 0
  const errores: string[] = []

  // Lotes de 200: PostgREST tiene tope de tamaño de payload y un lote gigante
  // que falla no deja saber cuál fila lo rompió.
  for (let i = 0; i < aInsertar.length; i += 200) {
    const lote = aInsertar.slice(i, i + 200).map((v) => ({
      name: v.fila.nombre?.trim() || null,
      // Se guarda el teléfono normalizado: phone_e164 es columna generada.
      phone: v.phone_e164,
      business_name: v.fila.negocio?.trim() || null,
      notes: v.fila.notas?.trim() || null,
      source_channel: body.canal || 'other',
      source_detail: 'Importado',
      current_stage: 'sin_contactar',
    }))

    const { error, count } = await db.from('leads').insert(lote, { count: 'exact' })
    if (error) errores.push(error.message)
    else importados += count ?? lote.length
  }

  return NextResponse.json({
    importados,
    sinTelefono,
    duplicadosEnArchivo,
    yaExistian: validas.length - aInsertar.length,
    errores: errores.length ? errores.slice(0, 3) : undefined,
  })
}
