import { createClient } from '@/lib/supabase/server'
import BriefsClient, { type BriefFila } from './BriefsClient'
import { requerirSesion } from '@/lib/supabase/requerirSesion'

export const dynamic = 'force-dynamic'

/**
 * Los briefs que mandaron los clientes.
 *
 * Antes esto era un mensaje de WhatsApp de 1.200 caracteres perdido entre el
 * resto del chat. Acá es una ficha que se lee mientras se diseña.
 */
export default async function BriefsPage() {
  // Segunda cerradura: no depender solo del proxy (ver requerirSesion).
  await requerirSesion()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_briefs')
    .select('*')
    .order('creado_at', { ascending: false })
    .range(0, 99)

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-2">Briefs</h1>
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
          No se pudieron cargar: {error.message}
        </p>
      </div>
    )
  }

  return <BriefsClient initial={(data as BriefFila[]) ?? []} />
}
