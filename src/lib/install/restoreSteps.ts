import type { InstallPhase, InstallStep } from './types'
import { tp2PathsMatch } from './weiduLog'
import { applyWeiduLogToSteps, type WeiduLogImportResult } from './weiduLogMap'

export interface BackupRestoreContext {
  /** Omitted for vanilla restarts, which clear outcomes in the restored phases. */
  createdAt?: string
  /** Omitted when all game folders were restored. */
  phases?: readonly InstallPhase[]
}

/** Older manifests use backup-<epoch seconds>; current manifests use ISO UTC. */
export function backupCreationTime(raw: string): number {
  const legacy = /^backup-(\d+)$/.exec(raw)
  const time = legacy ? Number(legacy[1]) * 1000 : Date.parse(raw)
  // Manifests record whole seconds. Installs are halted during the backup copy.
  return Number.isFinite(time) && (legacy || !/\.\d+/.test(raw)) ? time + 999 : time
}

function clearOutcome(step: InstallStep): InstallStep {
  return {
    ...step,
    tp2Path: '',
    stagedFolderName: '',
    weiduNumber: null,
    languageIndex: null,
    status: 'queued',
    progress: null,
    warnings: [],
    errors: [],
    resultLines: [],
    startedAt: undefined,
    finishedAt: undefined,
    stdoutLogPath: undefined,
    stderrLogPath: undefined,
    debugLogPath: undefined,
  }
}

/** Keep known pre-snapshot outcomes; the restored log remains authoritative. */
export function reconcileRestoredSteps(
  steps: InstallStep[],
  result: WeiduLogImportResult,
  context: BackupRestoreContext = {},
): InstallStep[] {
  const cutoff = backupCreationTime(context.createdAt ?? '')
  const hits = new Map(result.hits.map((hit) => [`${hit.phase}:${hit.componentId}`, hit]))
  const reset = applyWeiduLogToSteps(steps.map(clearOutcome), result)
  return steps.map((step, index) => {
    if (context.phases && !context.phases.includes(step.phase)) return step
    const hit = hits.get(`${step.phase}:${step.componentId}`)
    const finished = Date.parse(step.finishedAt ?? '')
    const started = step.startedAt ? Date.parse(step.startedAt) : finished
    const predatesBackup = finished <= cutoff && started <= cutoff
    const installed = step.status === 'succeeded' || step.status === 'succeededWithWarnings' ||
      step.status === 'alreadyInstalled'
    const sameInstall = hit && step.weiduNumber === hit.weiduNumber &&
      step.languageIndex === hit.languageIndex && tp2PathsMatch(step.tp2Path, hit.absoluteTp2Path)
    if (predatesBackup && (
      (installed && sameInstall) ||
      (!hit && (step.status === 'failed' || step.status === 'skipped'))
    )) {
      return step
    }
    return reset[index]!
  })
}
