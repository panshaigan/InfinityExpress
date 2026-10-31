import type { InstallRun, InstallStep } from './types'

export interface InstallCompatibilityIssue {
  stepId: string
  action: 'skip' | 'block'
  reason: string
}

export function pendingCompatibilitySteps(run: InstallRun): InstallStep[] {
  return run.steps.slice(run.cursor).filter((step) =>
    !['succeeded', 'succeededWithWarnings', 'alreadyInstalled', 'skipped'].includes(step.status),
  )
}

/** Check blockers first so a rejected preflight never partially changes a run. */
export function applyInstallCompatibility(
  run: InstallRun,
  issues: InstallCompatibilityIssue[],
): InstallRun {
  const pending = new Set(pendingCompatibilitySteps(run).map((step) => step.stepId))
  const relevant = issues.filter((issue) => pending.has(issue.stepId))
  const blockers = relevant.filter((issue) => issue.action === 'block')
  if (blockers.length) throw new Error([...new Set(blockers.map((issue) => issue.reason))].join('\n'))
  const skips = new Map(relevant.map((issue) => [issue.stepId, issue.reason]))
  return {
    ...run,
    steps: run.steps.map((step) => {
      const reason = skips.get(step.stepId)
      return reason ? { ...step, status: 'skipped', progress: null, warnings: [...step.warnings, reason] } : step
    }),
  }
}
