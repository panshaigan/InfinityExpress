import type { ComponentRunStatus, InstallRunState, InstallStep } from './types'

/** Step is finished for install sequencing (skip automatically). */
export function isStepDone(status: ComponentRunStatus): boolean {
  return (
    status === 'succeeded' ||
    status === 'succeededWithWarnings' ||
    status === 'alreadyInstalled' ||
    status === 'skipped'
  )
}

/** Step can still be installed, retried, or rolled back. */
export function isStepActionable(step: InstallStep): boolean {
  return !isStepDone(step.status)
}

/** First actionable step at or after `from`, else `steps.length`. */
export function nextActionableCursor(steps: InstallStep[], from: number): number {
  for (let i = Math.max(0, from); i < steps.length; i++) {
    if (isStepActionable(steps[i]!)) return i
  }
  return steps.length
}

/** Previous actionable step strictly before `from`, else -1. */
export function prevActionableCursor(steps: InstallStep[], from: number): number {
  for (let i = Math.min(from - 1, steps.length - 1); i >= 0; i--) {
    if (isStepActionable(steps[i]!)) return i
  }
  return -1
}

/** Immediate cursor move (not deferred until current step finishes). */
export function canMoveCursorImmediately(
  runState: InstallRunState | null | undefined,
): boolean {
  return (
    runState === 'idle' || runState === 'paused' || runState === 'stopped'
  )
}

export function stepIndexById(steps: InstallStep[], stepId: string): number {
  return steps.findIndex((s) => s.stepId === stepId)
}

/** Future steps eligible for breakpoints (not done, not currently active work). */
export function canSetBreakpoint(
  step: InstallStep,
  stepIndex: number,
  cursor: number,
  runState: string | null,
): boolean {
  if (isStepDone(step.status)) return false
  if (step.status === 'copying' || step.status === 'installing') return false
  if (runState === 'running' && stepIndex < cursor) return false
  if (stepIndex < cursor) return false
  return true
}
