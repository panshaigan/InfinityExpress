import { describe, expect, it } from 'vitest'
import {
  canMoveCursorImmediately,
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
