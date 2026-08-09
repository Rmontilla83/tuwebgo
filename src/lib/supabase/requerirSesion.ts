import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Exige sesión dentro de la página, no solo en el proxy.
 *
 * POR QUÉ EXISTE: hasta la auditoría del 2026-08-09 el portal confiaba SOLO en
 * `proxy.ts` para cerrar `/dashboard/*`. Un único punto de control, y encima
 * uno con antecedentes: Next 16.2.3 arrastraba el aviso GHSA de "Middleware /
 * Proxy bypass in App Router applications via segment-prefetch routes"
 * (CVSS 7.5). Con el middleware saltado, cinco de las seis páginas se
 * renderizaban sin que nadie preguntara quién eras.
 *
 * Los datos igual estaban a salvo —las consultas pasan por la RLS con la
 * sesión del visitante, y sin sesión no devuelven nada—, pero una puerta que
 * depende de una sola cerradura no es una puerta. Esto es la segunda cerradura.
 *
 * `getUser()` y no `getSession()`: el primero valida el token contra el
 * servidor de Auth; el segundo solo lee la cookie, que el cliente controla.
 */
export async function requerirSesion() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  return user
}
