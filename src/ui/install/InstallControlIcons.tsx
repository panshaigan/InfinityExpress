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

/** Eye with slash — hide completed / already-installed steps. */
export function HideInstalledIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.35 13.35a.75.75 0 0 1-1.06 0L2.65 3.71a.75.75 0 0 1 1.06-1.06l9.64 9.64a.75.75 0 0 1 0 1.06Z"
      />
      <path
        fill="currentColor"
        d="M8 3c3.1 0 5.6 1.85 7.05 4.5a.85.85 0 0 1 0 .95c-.55 1-1.3 1.85-2.2 2.55l-1.1-1.1A7.4 7.4 0 0 0 13.7 8 7.9 7.9 0 0 0 8 4.5c-.55 0-1.08.06-1.58.18L5.2 3.46C6.05 3.17 7 3 8 3ZM2.95 5.55c.55-.7 1.2-1.3 1.95-1.75l1.12 1.12A7.4 7.4 0 0 0 2.3 8a7.9 7.9 0 0 0 5.7 3.5c.35 0 .7-.03 1.03-.08l1.2 1.2c-.7.2-1.45.33-2.23.33-3.1 0-5.6-1.85-7.05-4.5a.85.85 0 0 1 0-.95c.4-.75.9-1.4 1.5-1.95Z"
      />
      <path
        fill="currentColor"
        d="M8 5.75c.35 0 .68.08.98.22l-2.5 2.5A2.25 2.25 0 0 1 8 5.75Zm2.03 1.27A2.25 2.25 0 0 1 7.02 10.03l2.01-2.01Z"
      />
    </svg>
  )
}
