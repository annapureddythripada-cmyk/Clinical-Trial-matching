export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <svg
        width="30"
        height="30"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="7" fill="#0F2942" />
        <path
          d="M16 7V25M7 16H25"
          stroke="#14B8A6"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="4.5" fill="#0F2942" stroke="#F8FAFC" strokeWidth="2" />
        <circle cx="16" cy="16" r="1.75" fill="#14B8A6" />
      </svg>
      {!compact && (
        <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Clinical Trial Match AI
        </span>
      )}
    </div>
  );
}
