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
