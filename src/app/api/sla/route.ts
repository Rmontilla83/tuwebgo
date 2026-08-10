import { NextResponse } from 'next/server'
import { revisarSla } from '@/lib/sla'

export const runtime = 'nodejs'
// Nunca cacheado: la respuesta depende de la hora y de la base.
export const dynamic = 'force-dynamic'

/**
 * GET /api/sla — revisa quién lleva demasiado esperando y avisa por correo.
 *
 * Lo llama el cron de Vercel (ver vercel.json) y también el webhook de
 * WhatsApp después de cada mensaje entrante. Los dos porque ninguno alcanza
 * solo: el webhook no se dispara si nadie escribe —y el caso típico del SLA
 * es justamente el silencio—, y el cron en el plan Hobby de Vercel corre una
 * vez al día por más que el horario diga otra cosa.
 *
 * Es idempotente: llamarlo de más no manda correos de más.
 */
export async function GET(request: Request) {
  // Vercel firma sus crons con CRON_SECRET si la variable existe. Cuando está
  // puesta se exige; cuando no, se deja pasar para que esto funcione recién
  // desplegado. El riesgo de dejarlo abierto es chico —solo puede adelantar
  // unos segundos un correo que igual iba a salir— pero conviene ponerla.
  const secreto = process.env.CRON_SECRET
  if (secreto && request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const r = await revisarSla()
  return NextResponse.json(r, { status: 200 })
}
