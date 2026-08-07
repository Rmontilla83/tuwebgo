import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

// Next 16 renombró `middleware` a `proxy`. Misma funcionalidad, nuevo nombre de archivo.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
