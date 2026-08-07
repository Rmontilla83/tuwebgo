import { createClient } from '@supabase/supabase-js'

/**
 * Cliente con service_role. Ignora RLS por completo.
 *
 * SOLO para Route Handlers de servidor. Nunca importar desde un componente de
 * cliente: la clave quedaría en el bundle del navegador y sería acceso total a
 * la base para cualquiera.
 *
 * Lo necesita el webhook porque wa_messages tiene RLS con SELECT únicamente
 * para authenticated — un mensaje entrante de Meta no viene con sesión de
 * ningún usuario.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
