import { describe, expect, it } from 'vitest'
import { buildRelationIndex } from '../selection/relations'
import type { ComponentNode, InstallSequenceModel } from '../xml/schema'
import {
  canRemoveStepFromPlan,
  deriveInstallLock,
  isComponentSelectionLocked,
  isModActionLocked,
  syncRunWithPlan,
} from './installLock'
import { buildInstallPlan } from './planBuilder'
import type { InstallRun, InstallStep } from './types'

function comp(id: string, modId: string, orderIndex: number, alwaysIf?: string): ComponentNode {
  return {
    key: id,
    tag: 'component',
    kind: 'component',
    componentId: id,
    orderIndex,
    attrs: { id, modId, label: id, ...(alwaysIf ? { alwaysIf } : {}) },
    effectiveEngine: '',
    children: [],
  }
}

function modelWith(components: ComponentNode[]): InstallSequenceModel {
  return {
    stations: [],
    componentsById: new Map(components.map((c) => [c.componentId, c])),
    componentsInOrder: [...components].sort((a, b) => a.orderIndex - b.orderIndex),
    nodesByKey: new Map(components.map((c) => [c.key, c])),
  }
}

function makeStep(
  componentId: string,
  modId: string,
  index: number,
  status: InstallStep['status'] = 'queued',
): InstallStep {
  return {
    stepId: `single:${String(index).padStart(4, '0')}`,
    phase: 'single',
    modId,
    tp2Path: '',
    stagedFolderName: '',
    componentId,
    componentLabel: componentId,
    weiduNumber: null,
    languageIndex: null,
    status,
    warnings: [],
    errors: [],
    resultLines: [],
  }
}

function makeRun(steps: InstallStep[], cursor: number, runState: InstallRun['runState']): InstallRun {
  return {
    runId: 'test-run',
    game: 'bg2',
    steps,
    cursor,
    runState,
    breakpointStepIds: [],
    logDir: '',
  }
}

describe('deriveInstallLock', () => {
  it('returns none for null or idle run', () => {
    expect(deriveInstallLock(null).mode).toBe('none')
    const run = makeRun([makeStep('a', 'ModA', 0)], 0, 'idle')
    expect(deriveInstallLock(run).mode).toBe('none')
  })

  it('marks working when running or waitingForInput', () => {
    const steps = [makeStep('a', 'ModA', 0, 'succeeded'), makeStep('b', 'ModB', 1)]
    expect(deriveInstallLock(makeRun(steps, 1, 'running')).mode).toBe('working')
    expect(deriveInstallLock(makeRun(steps, 1, 'waitingForInput')).mode).toBe('working')
  })

  it('marks halted for paused/stopped/failed/completed', () => {
    const steps = [makeStep('a', 'ModA', 0, 'succeeded')]
    expect(deriveInstallLock(makeRun(steps, 1, 'paused')).mode).toBe('halted')
    expect(deriveInstallLock(makeRun(steps, 1, 'stopped')).mode).toBe('halted')
    expect(deriveInstallLock(makeRun(steps, 1, 'failed')).mode).toBe('halted')
  })

  it('collects locked ids, installed badges, and mod codenames', () => {
    const steps = [
      makeStep('a', 'ModA', 0, 'succeeded'),
      makeStep('b', 'ModB', 1, 'skipped'),
      makeStep('c', 'ModC', 2, 'queued'),
    ]
    const lock = deriveInstallLock(makeRun(steps, 2, 'paused'))
    expect([...lock.lockedComponentIds]).toEqual(['a', 'b'])
    expect([...lock.installedComponentIds]).toEqual(['a'])
    expect([...lock.installedModCodenames]).toEqual(['moda', 'modb'])
    expect(lock.componentStepIndex.get('c')).toBe(2)
  })
})

describe('isComponentSelectionLocked', () => {
  const model = modelWith([
    comp('a', 'ModA', 0),
    comp('b', 'ModB', 1, 'a'),
    comp('c', 'ModC', 2),
  ])
  const relationIndex = buildRelationIndex(model)

  it('locks everything when working', () => {
    const lock = deriveInstallLock(makeRun([makeStep('c', 'ModC', 2)], 0, 'running'))
    expect(isComponentSelectionLocked('c', lock, model, relationIndex)).toBe(true)
  })

  it('locks before-cursor and alwaysIf-related components when halted', () => {
    const steps = [
      makeStep('a', 'ModA', 0, 'succeeded'),
      makeStep('b', 'ModB', 1),
      makeStep('c', 'ModC', 2),
    ]
    const lock = deriveInstallLock(makeRun(steps, 2, 'paused'))
    expect(isComponentSelectionLocked('a', lock, model, relationIndex)).toBe(true)
    expect(isComponentSelectionLocked('b', lock, model, relationIndex)).toBe(true)
    expect(isComponentSelectionLocked('c', lock, model, relationIndex)).toBe(false)
  })
})

describe('isModActionLocked', () => {
  it('locks all mods when working', () => {
    const lock = deriveInstallLock(makeRun([makeStep('a', 'ModA', 0)], 0, 'running'))
    expect(isModActionLocked('OtherMod', lock)).toBe(true)
  })

  it('locks only mods with steps before cursor when halted', () => {
    const steps = [makeStep('a', 'ModA', 0, 'succeeded'), makeStep('b', 'ModB', 1)]
    const lock = deriveInstallLock(makeRun(steps, 1, 'paused'))
    expect(isModActionLocked('ModA', lock)).toBe(true)
    expect(isModActionLocked('moda', lock)).toBe(true)
    expect(isModActionLocked('ModB', lock)).toBe(false)
  })
})

describe('canRemoveStepFromPlan', () => {
  it('allows remove at/after cursor when halted and not done', () => {
    const lock = deriveInstallLock(
      makeRun([makeStep('a', 'ModA', 0, 'succeeded'), makeStep('b', 'ModB', 1)], 1, 'paused'),
    )
    expect(canRemoveStepFromPlan(0, 'succeeded', lock)).toBe(false)
    expect(canRemoveStepFromPlan(1, 'queued', lock)).toBe(true)
    expect(canRemoveStepFromPlan(1, 'skipped', lock)).toBe(false)
  })
})

describe('syncRunWithPlan', () => {
  it('preserves step status by componentId and updates cursor', () => {
    const model = modelWith([
      comp('a', 'ModA', 0),
      comp('b', 'ModB', 1),
      comp('c', 'ModC', 2),
    ])
    const run = makeRun(
      [
        makeStep('a', 'ModA', 0, 'succeeded'),
        makeStep('b', 'ModB', 1, 'queued'),
        makeStep('c', 'ModC', 2, 'queued'),
      ],
      1,
      'paused',
    )
    const planSteps = buildInstallPlan(model, new Set(['a', 'c']), 'bg2')
    const synced = syncRunWithPlan(run, planSteps)
    expect(synced.steps.map((s) => s.componentId)).toEqual(['a', 'c'])
    expect(synced.steps[0]?.status).toBe('succeeded')
    expect(synced.steps[1]?.status).toBe('queued')
    expect(synced.cursor).toBe(1)
  })
})
