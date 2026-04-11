'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Credenciales incorrectas'); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[var(--dark)] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 grain"></div>
      <div className="absolute top-[-200px] right-[-150px] w-[500px] h-[500px] rounded-full bg-[var(--primary-glow)] blur-[100px] animate-float opacity-60"></div>
      <div className="absolute bottom-[-150px] left-[-100px] w-[400px] h-[400px] rounded-full bg-[var(--accent-glow)] blur-[100px] animate-float opacity-40" style={{ animationDelay: '-3s' }}></div>

      <div className="w-full max-w-[380px] relative z-10 animate-fade-in-scale">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-4">
            <svg viewBox="0 0 185 40" className="h-10" xmlns="http://www.w3.org/2000/svg">
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
          </div>
          <p className="text-white/30 text-xs font-[Space_Grotesk,sans-serif] font-semibold uppercase tracking-[0.2em]">Portal de control</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white/[0.04] glass border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          <div className="mb-5">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 font-[Space_Grotesk,sans-serif]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white text-sm focus:outline-none placeholder:text-white/20 transition-all duration-300"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div className="mb-7">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 font-[Space_Grotesk,sans-serif]">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] text-white text-sm focus:outline-none placeholder:text-white/20 transition-all duration-300"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="mb-5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 animate-fade-in">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[Space_Grotesk,sans-serif] hover:bg-[var(--primary-light)] transition-all duration-300 disabled:opacity-50 cursor-pointer relative overflow-hidden group"
          >
            <span className="relative z-10">{loading ? 'Entrando...' : 'Entrar al portal'}</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700"></div>
          </button>
        </form>

        <p className="text-center text-[10px] text-white/15 mt-8 font-[Space_Grotesk,sans-serif] tracking-wider">
          TUWEBGO.NET &mdash; SISTEMA INTERNO
        </p>
      </div>
    </div>
  )
}
