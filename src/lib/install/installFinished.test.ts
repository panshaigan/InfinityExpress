import { describe, expect, it } from 'vitest'
import {
  buildInstallFinishedSummary,
  countInstallOutcomes,
  stagedFoldersForGameDir,
  uniqueGameDirsForRun,
} from './installFinished'
import type { InstallRun, InstallStep } from './types'

function step(
  partial: Partial<InstallStep> & Pick<InstallStep, 'status'>,
): InstallStep {
  return {
    stepId: partial.stepId ?? 'single:0000',
    phase: partial.phase ?? 'single',
    modId: 'ModA',
    tp2Path: '',
    stagedFolderName: partial.stagedFolderName ?? '',
    componentId: 'a',
    componentLabel: 'A',
    weiduNumber: null,
    languageIndex: null,
    warnings: [],
    errors: [],
    resultLines: [],
    ...partial,
  }
}

const folders = {
  bg1: 'D:/games/bg1',
  bg2: 'D:/games/bg2ee',
  iwd: '',
  pst: '',
}

describe('countInstallOutcomes', () => {
  it('tallies terminal step statuses', () => {
    expect(
      countInstallOutcomes([
        step({ status: 'succeeded' }),
        step({ status: 'succeededWithWarnings' }),
        step({ status: 'skipped' }),
        step({ status: 'alreadyInstalled' }),
        step({ status: 'failed' }),
        step({ status: 'queued' }),
      ]),
    ).toEqual({
      installed: 1,
      withWarnings: 1,
      skipped: 1,
      alreadyInstalled: 1,
      failed: 1,
      total: 6,
    })
  })
})

describe('uniqueGameDirsForRun', () => {
  it('returns BG1 and BG2 folders for an EET run', () => {
    expect(
      uniqueGameDirsForRun(
        'eet',
        [
          { phase: 'eet1' },
          { phase: 'eet1' },
          { phase: 'eet' },
        ],
        folders,
      ),
    ).toEqual([
      { label: 'BG1', path: 'D:/games/bg1' },
      { label: 'BG2', path: 'D:/games/bg2ee' },
    ])
  })
})

describe('stagedFoldersForGameDir', () => {
  it('keeps WeiDU folder names for that game dir only', () => {
    expect(
      stagedFoldersForGameDir(
        'eet',
        [
          step({ phase: 'eet1', status: 'succeeded', stagedFolderName: 'bg1npc' }),
          step({ phase: 'eet', status: 'succeeded', stagedFolderName: 'cdtweaks' }),
          step({ phase: 'eet', status: 'succeeded', stagedFolderName: 'cdtweaks' }),
        ],
        folders,
        'D:/games/bg2ee',
      ),
    ).toEqual(['cdtweaks'])
  })
})

describe('buildInstallFinishedSummary', () => {
  it('includes duration and folders', () => {
    const run: InstallRun = {
      runId: 'run-1',
      game: 'bg2',
      cursor: 1,
      runState: 'completed',
      breakpointStepIds: [],
      plannedSnapshots: [],
      logDir: 'D:/logs/run-1',
      steps: [
        step({
          status: 'succeeded',
          startedAt: '2026-01-01T10:00:00.000Z',
          finishedAt: '2026-01-01T10:01:00.000Z',
        }),
      ],
    }
    const summary = buildInstallFinishedSummary(run, folders)
    expect(summary.installed).toBe(1)
    expect(summary.durationLabel).toBe('0:01:00')
    expect(summary.folders).toEqual([{ label: 'BG2', path: 'D:/games/bg2ee' }])
  })
})
