import { describe, expect, it } from 'vitest'
import {
  installRunRefFromSession,
  installRunStatePath,
  rewritePersistedInstallPaths,
} from './runStateStore'
import { buildPersistedInstallSession } from '../ui/appSessionPrefs'
import type { InstallRun } from './types'

function makeRun(): InstallRun {
  return {
    runId: '2026-08-21_15-30-45',
    game: 'bg2',
    logDir: 'D:/data/projects/MyEET/2026-08-21_15-30-45',
    cursor: 0,
    runState: 'paused',
    breakpointStepIds: [],
    plannedSnapshots: [],
    steps: [
      {
        stepId: 'single:0000',
        phase: 'single',
        modId: 'ModA',
        tp2Path: '',
        stagedFolderName: '',
        componentId: 'comp-a',
        componentLabel: 'Comp A',
        weiduNumber: 1,
        languageIndex: 0,
        status: 'succeeded',
        warnings: [],
        errors: [],
        resultLines: [],
        stdoutLogPath:
          'D:/data/projects/MyEET/2026-08-21_15-30-45/001-ModA-comp-a/ModA-comp-a-mod.log',
        stderrLogPath:
          'D:/data/projects/MyEET/2026-08-21_15-30-45/001-ModA-comp-a/ModA-comp-a-component.log',
        debugLogPath:
          'D:/data/projects/MyEET/2026-08-21_15-30-45/001-ModA-comp-a/setup-moda.debug',
      },
    ],
  }
}

describe('runStateStore', () => {
  it('builds run-state.json path under the log dir', () => {
    expect(installRunStatePath('D:/data/projects/P/run1')).toBe(
      'D:/data/projects/P/run1/run-state.json',
    )
  })

  it('installRunRefFromSession points at runId and logDir', () => {
    const session = buildPersistedInstallSession({
      game: 'bg2',
      selectedIds: new Set(['comp-a']),
      run: makeRun(),
      paused: true,
      selectedStepId: 'single:0000',
      selectedComponentId: 'comp-a',
      hideInstalled: false,
      pauseOnWarnings: false,
      followCursor: true,
      runElapsedMs: 1000,
    })
    expect(installRunRefFromSession(session)).toEqual({
      runId: '2026-08-21_15-30-45',
      logDir: 'D:/data/projects/MyEET/2026-08-21_15-30-45',
    })
  })

  it('rewritePersistedInstallPaths rewrites logDir and step paths', () => {
    const session = buildPersistedInstallSession({
      game: 'bg2',
      selectedIds: new Set(['comp-a']),
      run: makeRun(),
      paused: true,
      selectedStepId: null,
      selectedComponentId: null,
      hideInstalled: false,
      pauseOnWarnings: false,
      followCursor: false,
      runElapsedMs: 0,
    })
    const rewritten = rewritePersistedInstallPaths(
      session,
      'D:/data/projects/MyEET',
      'D:/data/projects/My EET (2)',
    )
    expect(rewritten.run.logDir).toBe(
      'D:/data/projects/My EET (2)/2026-08-21_15-30-45',
    )
    expect(rewritten.run.steps[0]?.stdoutLogPath).toContain(
      'D:/data/projects/My EET (2)/',
    )
    expect(rewritten.run.steps[0]?.stderrLogPath).toContain(
      'D:/data/projects/My EET (2)/',
    )
    expect(rewritten.run.steps[0]?.debugLogPath).toContain(
      'D:/data/projects/My EET (2)/',
    )
  })
})
