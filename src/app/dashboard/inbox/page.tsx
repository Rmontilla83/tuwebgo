import { createClient } from '@/lib/supabase/server'
import { assertNoError } from '@/lib/supabase/errors'
import InboxClient, { type Conversation } from './InboxClient'

const PAGE = 50

export default async function InboxPage() {
  const supabase = await createClient()

  // Carga inicial en servidor: evita el efecto-en-montaje del cliente y hace que
  // loading.tsx cubra la espera en vez de un spinner interno.
  const res = await supabase
    .from('wa_conversations')
    .select('*, leads(name, business_name, current_stage)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(0, PAGE - 1)

  assertNoError({ conversaciones: res })

  return <InboxClient initial={(res.data as Conversation[]) ?? []} />
}
