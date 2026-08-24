import { describe, expect, it } from 'vitest'
import {
  isStepDurationLive,
  playerDurationParts,
  stepDurationLabel,
  stepDurationMs,
  sumStepDurationsMs,
} from './formatDuration'
import type { InstallStep } from './types'

function step(
  partial: Partial<InstallStep> & Pick<InstallStep, 'status'>,
): InstallStep {
  return {
    stepId: 'single:0000',
    phase: 'single',
    modId: 'ModA',
    tp2Path: '',
    stagedFolderName: '',
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

describe('isStepDurationLive', () => {
  it('is true while copying/installing and run is running or waiting for input', () => {
    const active = step({
      status: 'installing',
      startedAt: '2026-01-01T10:00:00.000Z',
    })
    expect(isStepDurationLive(active, 'running')).toBe(true)
    expect(isStepDurationLive(active, 'waitingForInput')).toBe(true)
    expect(isStepDurationLive(active, 'paused')).toBe(false)
    expect(isStepDurationLive(active, 'stopped')).toBe(false)
  })

  it('is false for halted steps with open timestamps', () => {
    const halted = step({
      status: 'queued',
      startedAt: '2026-01-01T10:00:00.000Z',
    })
    expect(isStepDurationLive(halted, 'running')).toBe(false)
    expect(isStepDurationLive(halted, 'paused')).toBe(false)
  })
})

describe('playerDurationParts', () => {
  it('splits hours, minutes, and seconds', () => {
    expect(playerDurationParts(5_000)).toEqual({ hours: 0, minutes: 0, seconds: 5 })
    expect(playerDurationParts(125_000)).toEqual({ hours: 0, minutes: 2, seconds: 5 })
    expect(playerDurationParts(3_661_000)).toEqual({ hours: 1, minutes: 1, seconds: 1 })
  })

  it('clamps invalid values to zeros', () => {
    expect(playerDurationParts(-10)).toEqual({ hours: 0, minutes: 0, seconds: 0 })
    expect(playerDurationParts(Number.NaN)).toEqual({ hours: 0, minutes: 0, seconds: 0 })
  })
})

describe('stepDurationLabel', () => {
  it('uses h:mm:ss clock for live and finished steps', () => {
    const active = step({
      status: 'installing',
      startedAt: '2026-01-01T10:00:00.000Z',
    })
    expect(stepDurationLabel(active, Date.parse('2026-01-01T10:00:05.000Z'), 'running')).toBe(
      '0:00:05',
    )
    expect(
      stepDurationLabel(active, Date.parse('2026-01-01T10:00:05.000Z'), 'waitingForInput'),
    ).toBe('0:00:05')
    expect(stepDurationLabel(active, Date.parse('2026-01-01T10:00:05.000Z'), 'paused')).toBe(
      '0:00:00',
    )
  })

  it('hides duration for failed steps', () => {
    const failed = step({
      status: 'failed',
      startedAt: '2026-01-01T10:00:00.000Z',
      finishedAt: '2026-01-01T10:00:12.000Z',
    })
    expect(stepDurationLabel(failed, Date.parse('2026-01-01T10:00:12.000Z'), 'failed')).toBe(
      null,
    )
  })
})

describe('sumStepDurationsMs', () => {
  it('sums finished and live step clocks', () => {
    const now = Date.parse('2026-01-01T10:00:10.000Z')
    const steps = [
      step({
        status: 'succeeded',
        startedAt: '2026-01-01T10:00:00.000Z',
        finishedAt: '2026-01-01T10:00:03.000Z',
      }),
      step({
        status: 'installing',
        startedAt: '2026-01-01T10:00:05.000Z',
      }),
      step({ status: 'queued' }),
      step({
        status: 'failed',
        startedAt: '2026-01-01T09:00:00.000Z',
        finishedAt: '2026-01-01T09:00:30.000Z',
      }),
    ]
    expect(sumStepDurationsMs(steps, now, 'running')).toBe(3000 + 5000)
    expect(stepDurationMs(steps[1]!, now, 'running')).toBe(5000)
  })
})
