import { describe, expect, it } from 'vitest'
import { buildInstallPlan } from './planBuilder'
import type { ComponentNode, InstallSequenceModel } from '../xml/schema'

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

describe('buildInstallPlan', () => {
  it('batches consecutive same-mod components', () => {
    const model = modelWith([
      comp('a:0', 'ModA', 0),
      comp('a:1', 'ModA', 1),
      comp('b:0', 'ModB', 2),
      comp('a:2', 'ModA', 3),
    ])
    const selected = new Set(['a:0', 'a:1', 'b:0', 'a:2'])
    const steps = buildInstallPlan(model, selected, 'bg2')
    expect(steps).toHaveLength(3)
    expect(steps[0]?.modId).toBe('ModA')
    expect(steps[0]?.componentIds).toEqual(['a:0', 'a:1'])
    expect(steps[1]?.modId).toBe('ModB')
    expect(steps[2]?.modId).toBe('ModA')
    expect(steps[2]?.componentIds).toEqual(['a:2'])
  })
})
