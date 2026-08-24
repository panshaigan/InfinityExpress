import { gameDirForPhase } from '../desktop/weiduInstall'
import type { GameFolderPaths } from '../ui/gameFolderPrefs'
import { gameFolderKeyForPhase, gameFolderKeyLabel } from '../ui/gameFolderPrefs'
import type { SelectedGame } from '../xml/schema'
import { formatPlayerDurationMs, sumStepDurationsMs } from './formatDuration'
import type { ComponentRunStatus, InstallPhase, InstallRun, InstallStep } from './types'

export interface InstallFinishedFolder {
  label: string
  path: string
}

export interface InstallFinishedCounts {
  installed: number
  withWarnings: number
  skipped: number
  alreadyInstalled: number
  failed: number
  total: number
}

export interface InstallFinishedSummary extends InstallFinishedCounts {
  durationLabel: string
  folders: InstallFinishedFolder[]
}

export function countInstallOutcomes(
  steps: readonly Pick<InstallStep, 'status'>[],
): InstallFinishedCounts {
  let installed = 0
  let withWarnings = 0
  let skipped = 0
  let alreadyInstalled = 0
  let failed = 0
  for (const step of steps) {
    switch (step.status as ComponentRunStatus) {
      case 'succeeded':
        installed += 1
        break
      case 'succeededWithWarnings':
        withWarnings += 1
        break
      case 'skipped':
        skipped += 1
        break
      case 'alreadyInstalled':
        alreadyInstalled += 1
        break
      case 'failed':
        failed += 1
        break
      default:
        break
    }
  }
  return {
    installed,
    withWarnings,
    skipped,
    alreadyInstalled,
    failed,
    total: steps.length,
  }
}

export function uniqueGameDirsForRun(
  game: SelectedGame,
  steps: readonly { phase: InstallPhase }[],
  folders: GameFolderPaths,
): InstallFinishedFolder[] {
  const seen = new Set<string>()
  const out: InstallFinishedFolder[] = []
  for (const step of steps) {
    const path = gameDirForPhase(game, step.phase, folders).trim()
    if (!path) continue
    const key = path.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const folderKey = gameFolderKeyForPhase(game, step.phase)
    out.push({ label: gameFolderKeyLabel(folderKey), path })
  }
  return out
}

export function stagedFoldersForGameDir(
  game: SelectedGame,
  steps: readonly Pick<InstallStep, 'phase' | 'stagedFolderName'>[],
  folders: GameFolderPaths,
  gameDir: string,
): string[] {
  const want = gameDir.trim().replace(/\\/g, '/').toLowerCase()
  const names = new Set<string>()
  for (const step of steps) {
    const dir = gameDirForPhase(game, step.phase, folders).trim()
    if (dir.replace(/\\/g, '/').toLowerCase() !== want) continue
    const name = step.stagedFolderName.trim()
    if (name) names.add(name)
  }
  return [...names]
}

export function buildInstallFinishedSummary(
  run: InstallRun,
  folders: GameFolderPaths,
  nowMs = Date.now(),
): InstallFinishedSummary {
  const counts = countInstallOutcomes(run.steps)
  return {
    ...counts,
    durationLabel: formatPlayerDurationMs(
      sumStepDurationsMs(run.steps, nowMs, run.runState),
    ),
    folders: uniqueGameDirsForRun(run.game, run.steps, folders),
  }
}
