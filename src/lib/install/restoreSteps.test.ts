import { describe, expect, it } from 'vitest'
import { backupCreationTime, reconcileRestoredSteps } from './restoreSteps'
import type { InstallStep } from './types'
import type { WeiduLogImportResult } from './weiduLogMap'

const createdAt = '2026-10-31T12:00:00Z'
const before = '2026-10-31T11:59:00Z'
const after = '2026-10-31T12:01:00Z'

function step(overrides: Partial<InstallStep> = {}): InstallStep {
  return {
    stepId: 'single:0000', phase: 'single', componentId: 'mod:0', modId: 'Download',
    componentLabel: 'Component', tp2Path: 'D:/game/mod/mod.tp2', stagedFolderName: 'mod',
    weiduNumber: 0, languageIndex: 0, status: 'succeeded', progress: null,
    startedAt: before, finishedAt: before, warnings: ['warning'], errors: [], resultLines: [],
    stdoutLogPath: 'D:/logs/component-mod.log', stderrLogPath: 'D:/logs/component-component.log',
    debugLogPath: 'D:/logs/setup-mod.debug',
    ...overrides,
  }
}

function log(installed: InstallStep[] = []): WeiduLogImportResult {
  return {
    hasLog: installed.length > 0,
    hits: installed.map((s) => ({
      componentId: s.componentId, phase: s.phase, absoluteTp2Path: s.tp2Path,
      tp2Path: 'mod/mod.tp2', stagedFolderName: s.stagedFolderName,
      weiduNumber: s.weiduNumber!, languageIndex: s.languageIndex!,
    })),
    componentIds: new Set(installed.map((s) => s.componentId)),
    unmatched: [], listingErrors: [],
  }
}

describe('snapshot outcome reconciliation', () => {
  it('keeps earlier successful outcomes, warning details, timing, and log links', () => {
    const steps = [step(), step({ status: 'succeededWithWarnings', componentId: 'mod:1', weiduNumber: 1 })]
    const restored = reconcileRestoredSteps(steps, log(steps), { createdAt })
    expect(restored[0]).toBe(steps[0])
    expect(restored[1]).toBe(steps[1])
  })

  it('keeps earlier failures and skips even though they have no installed log row', () => {
    const steps = [step({ status: 'failed', errors: ['Failure'] }), step({ status: 'skipped' })]
    const restored = reconcileRestoredSteps(steps, log(), { createdAt })
    expect(restored[0]).toBe(steps[0])
    expect(restored[1]).toBe(steps[1])
  })

  it('clears later outcomes and log links, marking components present in the backup installed', () => {
    const late = step({ startedAt: after, finishedAt: after })
    const installed = reconcileRestoredSteps([late], log([late]), { createdAt })[0]!
    expect(installed.status).toBe('alreadyInstalled')
    const absent = reconcileRestoredSteps([late], log(), { createdAt })[0]!
    expect(absent.status).toBe('queued')
    for (const restored of [installed, absent]) {
      expect(restored.startedAt).toBeUndefined()
      expect(restored.finishedAt).toBeUndefined()
      expect(restored.stdoutLogPath).toBeUndefined()
      expect(restored.stderrLogPath).toBeUndefined()
      expect(restored.debugLogPath).toBeUndefined()
      expect(restored.warnings).toEqual([])
    }
  })

  it('clears earlier successes missing from the backup and uses restored identities', () => {
    const prior = step()
    expect(reconcileRestoredSteps([prior], log(), { createdAt })[0]?.status).toBe('queued')
    const changed = step({ languageIndex: 2, weiduNumber: 10 })
    const restored = reconcileRestoredSteps([prior], log([changed]), { createdAt })[0]!
    expect(restored).toMatchObject({ status: 'alreadyInstalled', languageIndex: 2, weiduNumber: 10 })
    expect(restored.stdoutLogPath).toBeUndefined()
  })

  it('uses the log for missing or invalid timestamps and for incomplete attempts', () => {
    for (const prior of [
      step({ finishedAt: undefined }), step({ finishedAt: 'unknown' }),
      step({ status: 'installing', finishedAt: undefined }),
    ]) {
      expect(reconcileRestoredSteps([prior], log([prior]), { createdAt })[0]?.status).toBe('alreadyInstalled')
      expect(reconcileRestoredSteps([prior], log(), { createdAt })[0]?.status).toBe('queued')
    }
    expect(reconcileRestoredSteps([step()], log([step()]), { createdAt: 'unknown' })[0]?.status)
      .toBe('alreadyInstalled')
  })

  it('preserves the untouched EET phase even for outcomes later than the snapshot', () => {
    const bg1 = step({ phase: 'eet1', startedAt: after, finishedAt: after })
    const bg2 = step({ phase: 'eet', startedAt: after, finishedAt: after })
    const restored = reconcileRestoredSteps([bg1, bg2], log([bg1]), { createdAt, phases: ['eet'] })
    expect(restored[0]).toBe(bg1)
    expect(restored[1]?.status).toBe('queued')
    const vanilla = reconcileRestoredSteps([bg1, bg2], log([bg1]), { phases: ['eet'] })
    expect(vanilla[0]).toBe(bg1)
    expect(vanilla[1]?.status).toBe('queued')
  })

  it('clears outcomes for vanilla restores without a snapshot creation time', () => {
    const prior = step({ status: 'skipped' })
    expect(reconcileRestoredSteps([prior], log())[0]?.status).toBe('queued')
  })

  it('accounts for whole-second backup times and supports legacy creation stamps', () => {
    const prior = step({ finishedAt: '2026-10-31T12:00:00.750Z' })
    expect(reconcileRestoredSteps([prior], log([prior]), { createdAt })[0]).toBe(prior)
    const seconds = Date.parse(createdAt) / 1000
    expect(backupCreationTime(`backup-${seconds}`)).toBe(backupCreationTime(createdAt))
    expect(backupCreationTime('2026-10-31T12:00:00.123Z')).toBe(Date.parse('2026-10-31T12:00:00.123Z'))
  })
})
