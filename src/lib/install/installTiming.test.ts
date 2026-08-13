import { describe, expect, it } from 'vitest'
import type { ComponentRunStatus } from './types'
import {
  buildComponentInstallTimingRecord,
  componentInstallTimesPath,
  isInstallTimingEligible,
  serializeInstallTimingLine,
  type BuildInstallTimingInput,
} from './installTiming'

function input(
  partial: Partial<BuildInstallTimingInput> = {},
): BuildInstallTimingInput {
  return {
    projectId: 'proj-abc',
    runId: 'run-xyz',
    game: 'eet',
    phase: 'eet',
    componentId: 'stratagems:5900',
    modId: 'SCS',
    weiduModId: 'stratagems',
    weiduNumber: 5900,
    status: 'succeeded',
    logVerified: true,
    didStage: false,
    startedAt: '2026-08-13T16:26:00.000Z',
    installStartedAt: '2026-08-13T16:26:01.200Z',
    finishedAt: '2026-08-13T16:26:46.400Z',
    installMs: 45200,
    loggedAt: '2026-08-13T16:26:46.400Z',
    ...partial,
  }
}

describe('componentInstallTimesPath', () => {
  it('joins metrics JSONL under the data folder', () => {
    expect(componentInstallTimesPath('D:/ie-data')).toBe(
      'D:/ie-data/metrics/component-install-times.jsonl',
    )
    expect(componentInstallTimesPath('D:/ie-data/')).toBe(
      'D:/ie-data/metrics/component-install-times.jsonl',
    )
    expect(componentInstallTimesPath('D:\\ie-data\\')).toBe(
      'D:/ie-data/metrics/component-install-times.jsonl',
    )
  })
})

describe('isInstallTimingEligible', () => {
  it('accepts success and warnings only', () => {
    expect(isInstallTimingEligible('succeeded')).toBe(true)
    expect(isInstallTimingEligible('succeededWithWarnings')).toBe(true)
    const skip: ComponentRunStatus[] = [
      'failed',
      'skipped',
      'alreadyInstalled',
      'needsInput',
      'queued',
      'copying',
      'installing',
    ]
    for (const status of skip) {
      expect(isInstallTimingEligible(status)).toBe(false)
    }
  })
})

describe('buildComponentInstallTimingRecord', () => {
  it('splits prepare, WeiDU, and wall clocks', () => {
    const record = buildComponentInstallTimingRecord(input())
    expect(record).toMatchObject({
      v: 1,
      projectId: 'proj-abc',
      runId: 'run-xyz',
      game: 'eet',
      phase: 'eet',
      componentId: 'stratagems:5900',
      modId: 'SCS',
      weiduModId: 'stratagems',
      weiduNumber: 5900,
      status: 'succeeded',
      logVerified: true,
      didStage: false,
      prepareMs: 1200,
      installMs: 45200,
      wallMs: 46400,
    })
  })

  it('keeps a separate sample when the same component is installed again', () => {
    const first = buildComponentInstallTimingRecord(
      input({ runId: 'run-1', didStage: true, installMs: 80000 }),
    )
    const second = buildComponentInstallTimingRecord(
      input({
        projectId: 'proj-other',
        runId: 'run-2',
        didStage: false,
        installMs: 40000,
        status: 'succeededWithWarnings',
        logVerified: false,
      }),
    )
    expect(first?.projectId).toBe('proj-abc')
    expect(second?.projectId).toBe('proj-other')
    expect(first?.installMs).toBe(80000)
    expect(second?.installMs).toBe(40000)
    expect(second?.status).toBe('succeededWithWarnings')
    expect(second?.logVerified).toBe(false)
  })

  it('returns null for ineligible statuses and missing identity or clocks', () => {
    expect(buildComponentInstallTimingRecord(input({ status: 'failed' }))).toBeNull()
    expect(buildComponentInstallTimingRecord(input({ status: 'skipped' }))).toBeNull()
    expect(
      buildComponentInstallTimingRecord(input({ status: 'alreadyInstalled' })),
    ).toBeNull()
    expect(buildComponentInstallTimingRecord(input({ projectId: '  ' }))).toBeNull()
    expect(buildComponentInstallTimingRecord(input({ weiduNumber: null }))).toBeNull()
    expect(buildComponentInstallTimingRecord(input({ startedAt: undefined }))).toBeNull()
    expect(buildComponentInstallTimingRecord(input({ finishedAt: 'nope' }))).toBeNull()
    expect(buildComponentInstallTimingRecord(input({ installMs: Number.NaN }))).toBeNull()
  })

  it('clamps negative durations to zero', () => {
    const record = buildComponentInstallTimingRecord(
      input({
        startedAt: '2026-08-13T16:26:10.000Z',
        installStartedAt: '2026-08-13T16:26:01.000Z',
        finishedAt: '2026-08-13T16:26:05.000Z',
        installMs: -12.4,
      }),
    )
    expect(record?.prepareMs).toBe(0)
    expect(record?.wallMs).toBe(0)
    expect(record?.installMs).toBe(0)
  })
})

describe('serializeInstallTimingLine', () => {
  it('writes one compact JSON object per line', () => {
    const record = buildComponentInstallTimingRecord(input())
    expect(record).not.toBeNull()
    const line = serializeInstallTimingLine(record!)
    expect(line.endsWith('\n')).toBe(true)
    expect(line.includes('\n', 0) && line.indexOf('\n') === line.length - 1).toBe(
      true,
    )
    expect(line.includes('\n  ')).toBe(false)
    expect(JSON.parse(line)).toEqual(record)
  })
})
