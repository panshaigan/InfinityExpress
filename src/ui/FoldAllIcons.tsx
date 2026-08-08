/** Shared fold/unfold-all glyphs for the station title bar and tree rows. */

export function UnfoldAllIcon({ className = 'station-fold-icon' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d="M2.75 1.5h10.5v1.1H2.75zm0 12.9h10.5v1.1H2.75z" />
      <path fill="currentColor" d="M4.6 6.6 8 3.2l3.4 3.4zm0 2.8h6.8L8 12.8z" />
    </svg>
  )
}

export function FoldAllIcon({ className = 'station-fold-icon' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d="M2.75 1.5h10.5v1.1H2.75zm0 12.9h10.5v1.1H2.75z" />
      <path fill="currentColor" d="M4.6 3.2h6.8L8 6.6zm0 9.6 3.4-3.4 3.4 3.4z" />
    </svg>
  )
}
