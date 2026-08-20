import { describe, expect, it } from 'vitest'
import { isStepDurationLive, stepDurationLabel } from './formatDuration'
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

describe('stepDurationLabel', () => {
  it('appends running suffix only for live steps', () => {
    const active = step({
      status: 'installing',
      startedAt: '2026-01-01T10:00:00.000Z',
    })
    expect(stepDurationLabel(active, Date.parse('2026-01-01T10:00:05.000Z'), 'running')).toBe(
      '5.0s (running)',
    )
    expect(
      stepDurationLabel(active, Date.parse('2026-01-01T10:00:05.000Z'), 'waitingForInput'),
    ).toBe('5.0s (running)')
    expect(stepDurationLabel(active, Date.parse('2026-01-01T10:00:05.000Z'), 'paused')).toBe('0ms')
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
