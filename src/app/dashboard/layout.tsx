'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { href: '/dashboard/campaigns', label: 'Campañas', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

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
          {NAV_ITEMS.map((item) => {
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

      {/* ── Mobile header ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[var(--dark)]/95 glass border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <svg viewBox="0 0 130 40" className="h-7" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="32" height="24" rx="5" fill="none" stroke="#A5B4FC" strokeWidth="2.5" opacity="0.8"/>
          <circle cx="9" cy="10" r="1.8" fill="#FF5F57"/>
          <circle cx="15" cy="10" r="1.8" fill="#FEBC2E"/>
          <circle cx="21" cy="10" r="1.8" fill="#28C840"/>
          <text x="42" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Tu</text>
          <text x="66" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#A5B4FC">Web</text>
          <text x="103" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Go</text>
        </svg>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white/70 p-1.5 hover:text-white transition-colors cursor-pointer">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>
      </div>

      {/* ── Mobile menu overlay ── */}
      {mobileOpen && mounted && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)}></div>
          <div className="lg:hidden fixed inset-y-0 left-0 z-50 w-[280px] bg-[var(--dark)] border-r border-white/[0.06] flex flex-col animate-slide-left">
            <div className="p-5 pb-2">
              <svg viewBox="0 0 185 40" className="h-8" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="32" height="24" rx="5" fill="none" stroke="#A5B4FC" strokeWidth="2.5" opacity="0.8"/>
                <circle cx="9" cy="10" r="1.8" fill="#FF5F57"/><circle cx="15" cy="10" r="1.8" fill="#FEBC2E"/><circle cx="21" cy="10" r="1.8" fill="#28C840"/>
                <text x="42" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Tu</text>
                <text x="66" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#A5B4FC">Web</text>
                <text x="103" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Go</text>
                <circle cx="126" cy="14" r="5" fill="#EA580C"/>
              </svg>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold font-[Space_Grotesk,sans-serif] transition-all ${
                      active ? 'bg-[var(--primary)] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="p-3 border-t border-white/[0.06]">
              <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/30 hover:text-white w-full cursor-pointer font-[Space_Grotesk,sans-serif]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 lg:ml-[240px] pt-[56px] lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
