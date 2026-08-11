import type { InstallStep } from './types'

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSec = ms / 1000
  if (totalSec < 60) {
    const rounded = totalSec < 10 ? totalSec.toFixed(1) : totalSec.toFixed(0)
    return `${rounded}s`
  }
  const minutes = Math.floor(totalSec / 60)
  const seconds = Math.round(totalSec % 60)
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return `${hours}h ${remMin}m`
}

/** Media-player style clock: `m:ss` or `h:mm:ss`. */
export function formatPlayerDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  }
  return `${minutes}:${ss}`
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
