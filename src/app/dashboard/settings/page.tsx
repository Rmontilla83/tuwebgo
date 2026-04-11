'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const supabase = createClient()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (newPw.length < 6) {
      setMessage({ type: 'err', text: 'La contraseña debe tener al menos 6 caracteres' })
      return
    }
    if (newPw !== confirmPw) {
      setMessage({ type: 'err', text: 'Las contraseñas no coinciden' })
      return
    }

    setLoading(true)

    // Verify current password by re-authenticating
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setMessage({ type: 'err', text: 'No se pudo obtener el usuario actual' })
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw,
    })

    if (signInError) {
      setMessage({ type: 'err', text: 'La contraseña actual es incorrecta' })
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })

    if (error) {
      setMessage({ type: 'err', text: error.message })
    } else {
      setMessage({ type: 'ok', text: 'Contraseña actualizada correctamente' })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    }
    setLoading(false)
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] tracking-tight">Configuración</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Ajustes de tu cuenta</p>
      </div>

      <div className="max-w-md">
        <div className="bg-white rounded-2xl p-6 border border-[var(--border)] shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 rounded-full gradient-bar"></div>
            <h2 className="text-sm font-bold text-[var(--dark)] font-[Space_Grotesk,sans-serif] uppercase tracking-wider">Cambiar contraseña</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">Contraseña actual</label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all duration-200" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">Nueva contraseña</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all duration-200" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 font-[Space_Grotesk,sans-serif]">Confirmar nueva contraseña</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--dark)] transition-all duration-200" />
            </div>

            {message && (
              <div className={`px-4 py-2.5 rounded-xl text-sm text-center font-medium animate-fade-in ${
                message.type === 'ok' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-500 border border-red-200'
              }`}>{message.text}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[Space_Grotesk,sans-serif] hover:bg-[var(--primary-light)] transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50">
              {loading ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
