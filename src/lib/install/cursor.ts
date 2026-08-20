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

/** Install is actively running or waiting on WeiDU input. */
export function isInstallInProcess(
  runState: InstallRunState | null | undefined,
): boolean {
  return runState === 'running' || runState === 'waitingForInput'
}

/**
 * Uninstall-back / immediate move-cursor: allowed when halted, not while live.
 * Matches idle / paused / stopped / failed (not completed).
 */
export function canUninstallBackState(
  runState: InstallRunState | null | undefined,
): boolean {
  return (
    runState === 'idle' ||
    runState === 'paused' ||
    runState === 'stopped' ||
    runState === 'failed'
  )
}

/** Immediate cursor move (blocked while install is in process). */
export function canMoveCursorImmediately(
  runState: InstallRunState | null | undefined,
): boolean {
  return canUninstallBackState(runState)
}

/** Run states where Previous (go back one step) is allowed. */
export function canNavigatePreviousState(
  runState: InstallRunState | null | undefined,
): boolean {
  return (
    runState == null ||
    runState === 'idle' ||
    runState === 'paused' ||
    runState === 'stopped' ||
    runState === 'failed'
  )
}

/** Run states where Skip (package at cursor) is allowed. */
export function canSkipState(
  runState: InstallRunState | null | undefined,
): boolean {
  return (
    runState == null ||
    runState === 'idle' ||
    runState === 'paused' ||
    runState === 'stopped' ||
    runState === 'waitingForInput' ||
    runState === 'failed'
  )
}

/** Previous enabled when cursor > 0 and state allows navigation. */
export function canGoPreviousAt(
  _steps: InstallStep[],
  cursor: number,
  runState: InstallRunState | null | undefined,
): boolean {
  return canNavigatePreviousState(runState) && cursor > 0
}

/** Skip enabled when a step exists after the cursor and the cursor step is skippable. */
export function canSkipAt(
  steps: InstallStep[],
  cursor: number,
  runState: InstallRunState | null | undefined,
): boolean {
  if (!canSkipState(runState)) return false
  if (cursor >= steps.length - 1) return false
  const step = steps[cursor]
  if (!step) return false
  if (
    step.status === 'succeeded' ||
    step.status === 'alreadyInstalled' ||
    step.status === 'skipped'
  ) {
    return false
  }
  return true
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
