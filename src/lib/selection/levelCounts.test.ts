import { describe, expect, it } from 'vitest'
import { countLevelContent } from './levelCounts'
import type { ComponentNode, InstallSequenceModel } from '../xml/schema'

function comp(
  id: string,
  opts: {
    modId?: string
    level?: string
    engine?: string
    noDisplay?: boolean
    orderIndex?: number
  } = {},
): ComponentNode {
  return {
    key: id,
    tag: 'component',
    kind: 'component',
    componentId: id,
    orderIndex: opts.orderIndex ?? 0,
    attrs: {
      id,
      modId: opts.modId,
      label: id,
      noDisplay: opts.noDisplay,
    },
    effectiveEngine: opts.engine ?? '',
    effectiveLevel: opts.level,
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

describe('countLevelContent', () => {
  const model = modelWith([
    comp('fix-a', { modId: 'ModA', level: 'fixes', orderIndex: 0 }),
    comp('fix-b', { modId: 'ModA', level: 'fixes', orderIndex: 1 }),
    comp('rest-a', { modId: 'ModB', level: 'restoration', orderIndex: 2 }),
    comp('ext-a', { modId: 'ModC', level: 'extended', orderIndex: 3 }),
    comp('ext-b', { modId: 'ModD', level: 'extended', orderIndex: 4 }),
    comp('blend-re', { modId: 'ModE', level: 'restructure', orderIndex: 5 }),
    comp('hard', { modId: 'ModF', level: 'higherDifficulty', orderIndex: 6 }),
    comp('hidden', {
      modId: 'ModG',
      level: 'fixes',
      noDisplay: true,
      orderIndex: 7,
    }),
    comp('iwd-only', {
      modId: 'ModH',
      level: 'fixes',
      engine: 'iwd',
      orderIndex: 8,
    }),
  ])

  it('counts only the exact ladder level (no accumulation)', () => {
    expect(countLevelContent(model, 'bg2', 'fixes')).toEqual({
      components: 2,
      mods: 1,
    })
    expect(countLevelContent(model, 'bg2', 'restoration')).toEqual({
      components: 1,
      mods: 1,
    })
    expect(countLevelContent(model, 'bg2', 'extended')).toEqual({
      components: 2,
      mods: 2,
    })
  })

  it('counts restructure with blendWell', () => {
    expect(countLevelContent(model, 'bg2', 'blendWell')).toEqual({
      components: 1,
      mods: 1,
    })
  })

  it('counts difficulty tokens exactly', () => {
    expect(countLevelContent(model, 'bg2', 'higherDifficulty')).toEqual({
      components: 1,
      mods: 1,
    })
    expect(countLevelContent(model, 'bg2', 'lowerDifficulty')).toEqual({
      components: 0,
      mods: 0,
    })
  })

  it('respects engine matching', () => {
    expect(countLevelContent(model, 'iwd', 'fixes')).toEqual({
      components: 3,
      mods: 2,
    })
  })
})
