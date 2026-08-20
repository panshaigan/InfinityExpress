import { describe, expect, it } from 'vitest'
import {
  canGoPreviousAt,
  canMoveCursorImmediately,
  canSkipAt,
  nextActionableCursor,
} from './cursor'
import type { InstallStep } from './types'

function step(
  id: string,
  status: InstallStep['status'] = 'queued',
): InstallStep {
  return {
    stepId: id,
    phase: 'single',
    modId: 'Mod',
    tp2Path: '',
    stagedFolderName: '',
    componentId: id,
    componentLabel: id,
    weiduNumber: null,
    languageIndex: null,
    status,
    warnings: [],
    errors: [],
    resultLines: [],
  }
}

describe('nextActionableCursor', () => {
  it('skips leading alreadyInstalled steps', () => {
    const steps = [
      step('a', 'alreadyInstalled'),
      step('b', 'alreadyInstalled'),
      step('c', 'queued'),
    ]
    expect(nextActionableCursor(steps, 0)).toBe(2)
  })

  it('returns steps.length when all steps are done', () => {
    const steps = [
      step('a', 'alreadyInstalled'),
      step('b', 'succeeded'),
    ]
    expect(nextActionableCursor(steps, 0)).toBe(2)
  })

  it('stays at the current index when that step is still actionable', () => {
    const steps = [step('a'), step('b'), step('c')]
    expect(nextActionableCursor(steps, 1)).toBe(1)
  })
})

describe('canMoveCursorImmediately', () => {
  it('allows idle, paused, and stopped', () => {
    expect(canMoveCursorImmediately('idle')).toBe(true)
    expect(canMoveCursorImmediately('paused')).toBe(true)
    expect(canMoveCursorImmediately('stopped')).toBe(true)
  })

  it('blocks running and terminal states', () => {
    expect(canMoveCursorImmediately('running')).toBe(false)
    expect(canMoveCursorImmediately('waitingForInput')).toBe(false)
    expect(canMoveCursorImmediately('completed')).toBe(false)
    expect(canMoveCursorImmediately('failed')).toBe(false)
    expect(canMoveCursorImmediately(null)).toBe(false)
  })
})

describe('canGoPreviousAt', () => {
  const steps = [step('a'), step('b'), step('c')]

  it('allows idle and failed when cursor > 0', () => {
    expect(canGoPreviousAt(steps, 1, 'idle')).toBe(true)
    expect(canGoPreviousAt(steps, 2, 'failed')).toBe(true)
    expect(canGoPreviousAt(steps, 1, null)).toBe(true)
  })

  it('blocks when cursor is 0 or run is active', () => {
    expect(canGoPreviousAt(steps, 0, 'idle')).toBe(false)
    expect(canGoPreviousAt(steps, 1, 'running')).toBe(false)
    expect(canGoPreviousAt(steps, 1, 'waitingForInput')).toBe(false)
  })
})

describe('canSkipAt', () => {
  const steps = [step('a'), step('b'), step('c')]

  it('allows idle when a step exists after the cursor', () => {
    expect(canSkipAt(steps, 0, 'idle')).toBe(true)
    expect(canSkipAt(steps, 1, 'failed')).toBe(true)
    expect(canSkipAt(steps, 0, null)).toBe(true)
  })

  it('blocks on the last step or non-skippable cursor status', () => {
    expect(canSkipAt(steps, 2, 'idle')).toBe(false)
    expect(canSkipAt([step('a', 'skipped'), step('b')], 0, 'idle')).toBe(false)
    expect(canSkipAt(steps, 0, 'running')).toBe(false)
  })
})
