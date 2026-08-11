const size = 16

export function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.2-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
    </svg>
  )
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M4.5 2.5h2.5v11H4.5zm4.5 0h2.5v11H9Z" />
    </svg>
  )
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M4 4h8v8H4z" />
    </svg>
  )
}

/** Skip forward: play chevron + end bar (media skip-next). */
export function SkipNextIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M2.75 3.1v9.8L10.6 8 2.75 3.1Z" />
      <path fill="currentColor" d="M11.75 3.1h1.9v9.8h-1.9z" />
    </svg>
  )
}
