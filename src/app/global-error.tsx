'use client'

import './globals.css'

// global-error reemplaza al root layout cuando se activa, así que debe traer
// sus propios <html> y <body>.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="es">
      <body>
        <title>Error — TuWebGo</title>
        <div className="min-h-screen bg-[var(--dark)] flex items-center justify-center p-6">
          <div className="w-full max-w-[400px] text-center">
            <svg viewBox="0 0 185 40" className="h-9 mx-auto mb-8" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="4" width="32" height="24" rx="5" fill="none" stroke="#A5B4FC" strokeWidth="2.5" opacity="0.8" />
              <circle cx="9" cy="10" r="1.8" fill="#FF5F57" />
              <circle cx="15" cy="10" r="1.8" fill="#FEBC2E" />
              <circle cx="21" cy="10" r="1.8" fill="#28C840" />
              <text x="42" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Tu</text>
              <text x="66" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#A5B4FC">Web</text>
              <text x="103" y="21" fontFamily="Space Grotesk,sans-serif" fontSize="17" fontWeight="700" fill="#fff">Go</text>
            </svg>

            <h1 className="text-xl font-bold text-white font-[family-name:var(--font-display)] mb-2">
              El portal no pudo arrancar
            </h1>
            <p className="text-sm text-white/40 mb-6">
              Ocurrió un error antes de poder renderizar la aplicación.
            </p>

            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 mb-6 text-left">
              <p className="text-xs text-white/50 font-mono break-words">
                {error.message || 'Error desconocido'}
              </p>
              {error.digest && (
                <p className="text-[10px] text-white/25 font-mono mt-1.5">digest: {error.digest}</p>
              )}
            </div>

            <button
              onClick={() => unstable_retry()}
              className="w-full py-3 px-4 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] transition-all duration-300 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
