import type { ComponentRunStatus } from './types'

export type WeiduStepOutcomeStatus = Extract<
  ComponentRunStatus,
  'succeeded' | 'succeededWithWarnings' | 'failed' | 'skipped'
>

export interface ResolveWeiduStepStatusInput {
  timedOut: boolean
  exitCode: number | null
  logVerified: boolean
  skippedFromOutput: boolean
  successfullyInstalledFromOutput: boolean
}

/**
 * Map WeiDU process outcome + console signals to a step status.
 * Sibling SUBCOMPONENT `SKIPPING:` must not override a real install.
 */
export function resolveWeiduStepStatus(
  input: ResolveWeiduStepStatusInput,
): WeiduStepOutcomeStatus {
  const {
    timedOut,
    exitCode,
    logVerified,
    skippedFromOutput,
    successfullyInstalledFromOutput,
  } = input

  if (timedOut) return 'failed'
  if (exitCode === 0 && logVerified) return 'succeeded'

  const installedOk = logVerified || successfullyInstalledFromOutput
  if (skippedFromOutput && !installedOk) return 'skipped'

  if (exitCode === 0 || exitCode === 3) return 'succeededWithWarnings'
  return 'failed'
}
