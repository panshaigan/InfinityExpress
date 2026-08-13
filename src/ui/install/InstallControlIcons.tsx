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

/** Skip back: end bar + play chevron (media skip-previous). */
export function SkipPreviousIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M13.25 3.1v9.8L5.4 8l7.85-4.9Z" />
      <path fill="currentColor" d="M2.35 3.1h1.9v9.8h-1.9z" />
    </svg>
  )
}

/** Breakpoint marker (filled circle). */
export function BreakpointIcon({ active = false }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r={active ? 4.5 : 3.5}
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

/** Roll back / uninstall to here (undo arrow). */
export function UninstallBackIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 3.5a4.5 4.5 0 0 1 4.24 3h-1.52a3 3 0 1 0 .28 4.12l.85.85A4.5 4.5 0 1 1 8 3.5Zm-2.1 2.4 2.35 2.35H3.5V4.65l2.4 1.25Z"
      />
    </svg>
  )
}

/** Move install cursor to this step. */
export function MoveCursorIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M3 2.5h10v1.5H3V2.5Zm0 4.25h7v1.5H3V6.75Zm0 4.25h10v1.5H3v-1.5Z" />
      <path fill="currentColor" d="M12.25 7.25 14.5 9.5l-2.25 2.25V7.25Z" />
    </svg>
  )
}

/** Remove from install plan (uncheck in Components). */
export function RemoveFromPlanIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.5 3.5h9v1.5h-9V3.5Zm1.25 3.25h6.5v7.5a.75.75 0 0 1-.75.75H5.5a.75.75 0 0 1-.75-.75V6.75Zm1.5 1.5v4.5h1.75V8.25H6.25Zm3 0v4.5h1.75V8.25H9.25Z"
      />
    </svg>
  )
}

/** Restart from vanilla backup (circular arrow). */
export function RestartIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 2.5a5.5 5.5 0 0 1 5.24 3.75h-1.65a4 4 0 1 0 .35 5.5l.9.9A5.5 5.5 0 1 1 8 2.5Zm-3.1 2.65 2.5 2.5H3.5V3.65l1.4 1.5Z"
      />
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

/** Double chevron down — collapse bottom console panel. */
export function ChevronDoubleDownIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.2 3.35a.75.75 0 0 1 1.06 0L8 7.09l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L3.2 4.41a.75.75 0 0 1 0-1.06Zm0 4.5a.75.75 0 0 1 1.06 0L8 11.59l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L3.2 8.91a.75.75 0 0 1 0-1.06Z"
      />
    </svg>
  )
}

/** Double chevron up — expand bottom console panel. */
export function ChevronDoubleUpIcon() {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.47 2.22a.75.75 0 0 1 1.06 0l4.27 4.27a.75.75 0 1 1-1.06 1.06L8 3.91 4.26 7.55a.75.75 0 0 1-1.06-1.06l4.27-4.27Zm0 4.5a.75.75 0 0 1 1.06 0l4.27 4.27a.75.75 0 1 1-1.06 1.06L8 8.41l-3.74 3.74a.75.75 0 0 1-1.06-1.06l4.27-4.27Z"
      />
    </svg>
  )
}
