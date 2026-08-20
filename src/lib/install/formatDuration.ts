import type { ComponentRunStatus, InstallRunState, InstallStep } from './types'

const ACTIVE_STEP_STATUSES = new Set<ComponentRunStatus>(['copying', 'installing'])

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

/** True while WeiDU is actively working this step (table/detail tick). */
export function isStepDurationLive(
  step: Pick<InstallStep, 'status' | 'startedAt' | 'finishedAt'>,
  runState: InstallRunState | null | undefined,
): boolean {
  if (!step.startedAt || step.finishedAt) return false
  if (!ACTIVE_STEP_STATUSES.has(step.status)) return false
  return runState === 'running' || runState === 'waitingForInput'
}

/** Elapsed label for an install step; null when not started or failed. */
export function stepDurationLabel(
  step: Pick<InstallStep, 'status' | 'startedAt' | 'finishedAt'>,
  nowMs: number,
  runState?: InstallRunState | null,
): string | null {
  if (step.status === 'failed') return null
  if (!step.startedAt) return null
  const start = Date.parse(step.startedAt)
  if (!Number.isFinite(start)) return null
  const live = isStepDurationLive(step, runState)
  const end = step.finishedAt ? Date.parse(step.finishedAt) : live ? nowMs : start
  if (!Number.isFinite(end)) return null
  const label = formatDurationMs(Math.max(0, end - start))
  if (live) return `${label} (running)`
  return label
}
