import Link from 'next/link'

export default function NotFound() {
  return (
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

        <p className="text-5xl font-bold text-white/15 font-[family-name:var(--font-display)] mb-3">404</p>
        <h1 className="text-lg font-bold text-white font-[family-name:var(--font-display)] mb-2">
          Esta página no existe
        </h1>
        <p className="text-sm text-white/40 mb-7">
          El enlace que seguiste no corresponde a ninguna sección del portal.
        </p>

        <Link
          href="/dashboard"
          className="inline-block py-3 px-6 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm font-[family-name:var(--font-display)] hover:bg-[var(--primary-light)] transition-all duration-300"
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  )
}
