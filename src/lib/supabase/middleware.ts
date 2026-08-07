import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresca la sesión de Supabase en cada request y protege /dashboard.
 *
 * CRÍTICO: cuando el access token expira (~1h), Supabase emite cookies nuevas
 * vía setAll(). Esas cookies viven en `supabaseResponse`. Si devolvemos un
 * NextResponse.redirect() nuevo sin copiarlas, el navegador se queda con la
 * cookie vieja e inválida para siempre — el síntoma es "entro, funciona un
 * rato, y al día siguiente me rebota al login y no se arregla ni volviendo a
 * loguearme". Por eso todo redirect pasa por redirectWithCookies().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Copia las cookies refrescadas de supabaseResponse al response final.
  const redirectWithCookies = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // getUser() valida el token contra el servidor de Auth y lo refresca si hace falta.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Un fallo de red contra Supabase no debe desloguear al usuario: dejamos pasar
  // el request y que la página maneje la ausencia de datos. Solo redirigimos
  // cuando Auth responde de verdad que no hay sesión.
  const authUnreachable =
    !!error && !['session_not_found', 'bad_jwt'].includes(error.code ?? '') && error.status === undefined

  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard')

  if (!user && isDashboard && !authUnreachable) {
    return redirectWithCookies('/login')
  }

  if (user && request.nextUrl.pathname === '/login') {
    return redirectWithCookies('/dashboard')
  }

  return supabaseResponse
}
