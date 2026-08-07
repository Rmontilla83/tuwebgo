export default function DashboardLoading() {
  return (
    <div className="animate-fade-in">
      {/* Header skeleton */}
      <div className="mb-6 sm:mb-8">
        <div className="h-8 w-40 rounded-lg bg-[var(--bg-alt)] animate-pulse" />
        <div className="h-4 w-24 rounded bg-[var(--bg-alt)] animate-pulse mt-2" />
      </div>

      {/* KPI skeletons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-[var(--card)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] shadow-sm"
          >
            <div className="h-3 w-16 rounded bg-[var(--bg-alt)] animate-pulse" />
            <div className="h-7 w-20 rounded-lg bg-[var(--bg-alt)] animate-pulse mt-3" />
            <div className="h-3 w-24 rounded bg-[var(--bg-alt)] animate-pulse mt-2" />
          </div>
        ))}
      </div>

      {/* Content skeletons */}
      <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="lg:col-span-3 bg-[var(--card)] rounded-2xl p-5 sm:p-6 border border-[var(--border)] shadow-sm">
          <div className="h-4 w-44 rounded bg-[var(--bg-alt)] animate-pulse mb-6" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 rounded-full bg-[var(--bg-alt)] animate-pulse" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="h-[150px] rounded-2xl bg-[var(--bg-alt)] animate-pulse" />
          <div className="h-[110px] rounded-2xl bg-[var(--bg-alt)] animate-pulse" />
        </div>
      </div>
    </div>
  )
}
