import { createClient } from '@/lib/supabase/server'
import { assertNoError } from '@/lib/supabase/errors'
import InboxClient, { type Conversation } from './InboxClient'
import { requerirSesion } from '@/lib/supabase/requerirSesion'

const PAGE = 50

export default async function InboxPage() {
  // Segunda cerradura: no depender solo del proxy (ver requerirSesion).
  await requerirSesion()
  const supabase = await createClient()

  // Carga inicial en servidor: evita el efecto-en-montaje del cliente y hace que
  // loading.tsx cubra la espera en vez de un spinner interno.
  const res = await supabase
    .from('wa_conversations')
    .select('*, leads(name, business_name, current_stage)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(0, PAGE - 1)

  // Sin is_lost: 'Perdido' no puede estar al lado de las demás como si fuera un
  // paso más. Marcarlo por error saca el lead del Pipeline sin vuelta atrás.
  const etapasRes = await supabase.from('pipeline_stages')
    .select('slug, label, sort_order').eq('is_lost', false).order('sort_order')

  assertNoError({ conversaciones: res, etapas: etapasRes })

  return <InboxClient initial={(res.data as Conversation[]) ?? []} etapas={etapasRes.data ?? []} />
}
