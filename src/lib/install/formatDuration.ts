import type { InstallStep } from './types'

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) {
    const rounded = ms / 1000 < 10 ? (ms / 1000).toFixed(1) : String(totalSec)
    return `${rounded}s`
  }
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

/** Media-player style clock: always `h:mm:ss`. */
export function formatPlayerDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00:00'
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Elapsed label for an install step; null when not started. */
export function stepDurationLabel(
  step: Pick<InstallStep, 'startedAt' | 'finishedAt'>,
  nowMs: number,
): string | null {
  if (!step.startedAt) return null
  const start = Date.parse(step.startedAt)
  if (!Number.isFinite(start)) return null
  const end = step.finishedAt ? Date.parse(step.finishedAt) : nowMs
  if (!Number.isFinite(end)) return null
  const label = formatDurationMs(end - start)
  if (!step.finishedAt) return `${label} (running)`
  return label
}
