'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useInboxAlerts } from '@/lib/useInboxAlerts'

const ICON_CONFIG = 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'

// Inbox entra como 2ª pestaña. Config sale del bottom bar al menú del header:
// 6 pestañas no caben en móvil con touch targets decentes (~64px cada una).
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { href: '/dashboard/inbox', label: 'Inbox', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { href: '/dashboard/campaigns', label: 'Campañas', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

// Sidebar de escritorio: ahí sí entra Config, hay espacio de sobra.
const NAV_DESKTOP = [...NAV_ITEMS, { href: '/dashboard/settings', label: 'Config', icon: ICON_CONFIG }]

/** Burbuja de alerta. Ámbar cuando algo espera a un humano, índigo si solo hay sin leer. */
function Badge({ n, urgente, className = '' }: { n: number; urgente: boolean; className?: string }) {
  if (n <= 0) return null
  return (
    <span
      aria-label={`${n} ${urgente ? 'esperando respuesta tuya' : 'sin leer'}`}
      className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none ${
        urgente ? 'bg-amber-400 text-amber-950' : 'bg-[var(--primary)] text-white'
      } ${className}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { sinLeer, requierenHumano } = useInboxAlerts()

  // Lo que espera a un humano manda sobre lo simplemente no leído.
  const alertaInbox = requierenHumano > 0 ? requierenHumano : sinLeer
  const alertaUrgente = requierenHumano > 0

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex w-[240px] bg-[var(--dark)] flex-col fixed inset-y-0 left-0 z-30 border-r border-white/[0.06]">
        {/* Logo */}
        <div className="p-5 pb-6">
          <svg viewBox="0 0 185 40" className="h-8" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="32" height="24" rx="5" fill="none" stroke="#A5B4FC" strokeWidth="2.5" opacity="0.8"/>
            <circle cx="9" cy="10" r="1.8" fill="#FF5F57"/>
            <circle cx="15" cy="10" r="1.8" fill="#FEBC2E"/>
            <circle cx="21" cy="10" r="1.8" fill="#28C840"/>
            <line x1="2" y1="15" x2="34" y2="15" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2"/>
            <text x="10" y="26" fontFamily="Space Grotesk,sans-serif" fontSize="6.5" fontWeight="700" fill="rgba(255,255,255,0.4)">&lt;/&gt;</text>
            <text x="42" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Tu</text>
            <text x="66" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#A5B4FC">Web</text>
            <text x="103" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Go</text>
            <circle cx="126" cy="14" r="5" fill="#EA580C"/>
            <path d="M124.2 14.5 L125.5 12 L125 13.8 L127.2 12.8" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="text-[9px] text-white/25 font-[Space_Grotesk,sans-serif] font-semibold uppercase tracking-[0.15em] mt-1.5 ml-0.5">Portal de control</p>
        </div>

        {/* Divider */}
        <div className="mx-4 mb-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {NAV_DESKTOP.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold font-[Space_Grotesk,sans-serif] transition-all duration-300 relative ${
                  active
                    ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/25'
                    : 'text-white/45 hover:text-white/90 hover:bg-white/[0.05]'
                }`}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-1 h-5 bg-white rounded-full"></div>
                )}
                <svg className={`w-[18px] h-[18px] flex-shrink-0 transition-transform duration-300 ${active ? '' : 'group-hover:scale-110'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                {item.label}
                {item.href === '/dashboard/inbox' && (
                  <Badge n={alertaInbox} urgente={alertaUrgente} className="ml-auto" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-3 mt-auto">
          <div className="mx-1 mb-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-[Space_Grotesk,sans-serif] text-white/30 hover:text-white/70 hover:bg-white/[0.04] transition-all duration-300 w-full cursor-pointer"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Salir
          </button>
        </div>
      </aside>

      {/* ── Mobile header (simplified - just logo + page context) ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[var(--dark)]/95 glass border-b border-white/[0.06] px-4 h-12 flex items-center justify-center safe-top">
        {/* Config y Salir viven acá porque el bottom bar ya tiene sus 5 pestañas */}
        <div className="absolute right-3 flex items-center gap-1">
          <Link
            href="/dashboard/settings"
            aria-label="Configuración"
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${pathname.startsWith('/dashboard/settings') ? 'text-white bg-white/10' : 'text-white/40 active:text-white/70'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON_CONFIG} />
            </svg>
          </Link>
          <button
            onClick={handleLogout}
            aria-label="Salir"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/40 active:text-white/70 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
        <svg viewBox="0 0 130 40" className="h-6" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="32" height="24" rx="5" fill="none" stroke="#A5B4FC" strokeWidth="2.5" opacity="0.8"/>
          <circle cx="9" cy="10" r="1.8" fill="#FF5F57"/>
          <circle cx="15" cy="10" r="1.8" fill="#FEBC2E"/>
          <circle cx="21" cy="10" r="1.8" fill="#28C840"/>
          <text x="42" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Tu</text>
          <text x="66" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#A5B4FC">Web</text>
          <text x="103" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Go</text>
        </svg>
      </div>

      {/* ── Bottom tab bar (mobile) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--dark)]/95 glass border-t border-white/[0.06] safe-bottom">
        <div className="flex items-stretch">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors duration-200 ${
                  active ? 'text-white' : 'text-white/35 active:text-white/60'
                }`}
              >
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-[var(--primary)] rounded-b-full"></div>
                )}
                <div className="relative">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  {item.href === '/dashboard/inbox' && (
                    <Badge n={alertaInbox} urgente={alertaUrgente} className="absolute -top-1.5 -right-2.5 ring-2 ring-[var(--dark)]" />
                  )}
                </div>
                <span className={`text-[10px] font-[Space_Grotesk,sans-serif] leading-none ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className="flex-1 lg:ml-[240px] pt-12 lg:pt-0 pb-16 lg:pb-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
