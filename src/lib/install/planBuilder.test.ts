import { describe, expect, it } from 'vitest'
import { buildInstallPlan, expandStepsToTableRows } from './planBuilder'
import type { InstallStep } from './types'
import type {
  ComponentNode,
  ContainerNode,
  InstallSequenceModel,
  TreeNode,
} from '../xml/schema'

function comp(
  id: string,
  modId: string,
  orderIndex: number,
  engine?: string,
): ComponentNode {
  return {
    key: id,
    tag: 'component',
    kind: 'component',
    componentId: id,
    orderIndex,
    attrs: { id, modId, label: id, engine },
    effectiveEngine: engine ?? '',
    children: [],
  }
}

function modelWith(components: ComponentNode[]): InstallSequenceModel {
  const componentsById = new Map(components.map((c) => [c.componentId, c]))
  return {
    stations: [],
    componentsById,
    componentsInOrder: [...components].sort((a, b) => a.orderIndex - b.orderIndex),
    nodesByKey: new Map(components.map((c) => [c.key, c])),
  }
}

function modelWithParentMod(
  modId: string,
  components: ComponentNode[],
): InstallSequenceModel {
  const modKey = `mod:${modId}`
  const withParent = components.map((c) => ({ ...c, parentKey: modKey }))
  const mod: ContainerNode = {
    key: modKey,
    tag: 'mod',
    kind: 'container',
    attrs: { id: modId },
    effectiveEngine: '',
    children: withParent,
  }
  const nodes: TreeNode[] = [mod, ...withParent]
  return {
    stations: [],
    componentsById: new Map(withParent.map((c) => [c.componentId, c])),
    componentsInOrder: [...withParent].sort((a, b) => a.orderIndex - b.orderIndex),
    nodesByKey: new Map(nodes.map((n) => [n.key, n])),
  }
}

describe('buildInstallPlan', () => {
  it('emits one step per selected component', () => {
    const model = modelWith([
      comp('a:0', 'ModA', 0),
      comp('a:1', 'ModA', 1),
      comp('b:0', 'ModB', 2),
      comp('a:2', 'ModA', 3),
    ])
    const selected = new Set(['a:0', 'a:1', 'b:0', 'a:2'])
    const steps = buildInstallPlan(model, selected, 'bg2')
    expect(steps).toHaveLength(4)
    expect(steps[0]?.modId).toBe('ModA')
    expect(steps[0]?.componentId).toBe('a:0')
    expect(steps[1]?.modId).toBe('ModA')
    expect(steps[1]?.componentId).toBe('a:1')
    expect(steps[2]?.modId).toBe('ModB')
    expect(steps[2]?.componentId).toBe('b:0')
    expect(steps[3]?.modId).toBe('ModA')
    expect(steps[3]?.componentId).toBe('a:2')
  })

  it('inherits mod id from parent mod when component has no modId', () => {
    const children: ComponentNode[] = [
      {
        key: 'bg1ub:11',
        tag: 'component',
        kind: 'component',
        componentId: 'bg1ub:11',
        orderIndex: 0,
        attrs: { id: 'bg1ub:11', label: 'Scar' },
        effectiveEngine: '',
        children: [],
      },
      {
        key: 'bg1ub:16',
        tag: 'component',
        kind: 'component',
        componentId: 'bg1ub:16',
        orderIndex: 1,
        attrs: { id: 'bg1ub:16', label: 'Creature Corrections' },
        effectiveEngine: '',
        children: [],
      },
    ]
    const model = modelWithParentMod('bg1ub', children)
    const selected = new Set(['bg1ub:11', 'bg1ub:16'])
    const steps = buildInstallPlan(model, selected, 'bg2')
    expect(steps).toHaveLength(2)
    expect(steps[0]?.modId).toBe('bg1ub')
    expect(steps[0]?.componentId).toBe('bg1ub:11')
    expect(steps[1]?.modId).toBe('bg1ub')
    expect(steps[1]?.componentId).toBe('bg1ub:16')
  })
})

describe('expandStepsToTableRows', () => {
  function queuedStep(
    partial: Pick<InstallStep, 'stepId' | 'modId' | 'componentId' | 'componentLabel'> &
      Partial<Pick<InstallStep, 'phase'>>,
  ): InstallStep {
    return {
      phase: 'single',
      tp2Path: '',
      stagedFolderName: '',
      weiduNumber: null,
      languageIndex: null,
      status: 'queued',
      warnings: [],
      errors: [],
      resultLines: [],
      ...partial,
    }
  }

  it('assigns one order per step', () => {
    const steps = [
      queuedStep({
        stepId: 'single:0000',
        modId: 'EEex',
        componentId: 'e:0',
        componentLabel: 'A',
      }),
      queuedStep({
        stepId: 'single:0001',
        modId: 'EEex',
        componentId: 'e:1',
        componentLabel: 'B',
      }),
      queuedStep({
        stepId: 'single:0002',
        modId: 'Other',
        componentId: 'o:0',
        componentLabel: 'X',
      }),
    ]
    const rows = expandStepsToTableRows(steps)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3])
  })
})
