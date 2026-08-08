'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] error boundary:', error)
  }, [error])

  return (
    <div className="animate-fade-in flex items-center justify-center min-h-[60vh]">
      <div className="bg-[var(--card)] rounded-2xl p-8 border border-[var(--border)] shadow-sm max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-[var(--dark)] font-[family-name:var(--font-display)] mb-2">
          Algo falló al cargar esta sección
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          No se pudieron traer los datos. Suele ser un problema de conexión con la base o de
          permisos de la sesión.
        </p>

        <div className="bg-[var(--bg-alt)] rounded-xl p-3 mb-5 text-left">
          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 font-[family-name:var(--font-display)]">
            Detalle técnico
          </p>
          <p className="text-xs text-[var(--text-secondary)] font-mono break-words">
            {error.message || 'Error desconocido'}
          </p>
          {error.digest && (
            <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1.5">
              digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => unstable_retry()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] transition-all duration-300 cursor-pointer"
          >
            Reintentar
          </button>
          <a
            href="/login"
            className="py-2.5 px-4 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] font-semibold text-sm font-[family-name:var(--font-display)] hover:bg-[var(--bg-alt)] transition-all duration-300"
          >
            Volver a entrar
          </a>
        </div>
      </div>
    </div>
  )
}
