import { describe, expect, it } from 'vitest'
import {
  levelFilterRank,
  levelPassesFilter,
} from '../levels'
import {
  DEFAULT_FILTER_CRITERIA,
  STABILITY_RELEASED,
  filterDisplayTree,
  normalizeStability,
  type FilterCriteria,
} from '../selection/filterDisplayTree'
import type { DisplayNode } from '../selection/visibility'
import type { ComponentNode, TreeNode } from '../xml/schema'

function component(
  id: string,
  attrs: ComponentNode['attrs'] & { effectiveLevel?: string } = {},
): DisplayNode {
  const { effectiveLevel, ...rest } = attrs
  const node: ComponentNode = {
    kind: 'component',
    tag: 'component',
    key: id,
    componentId: id,
    orderIndex: 0,
    attrs: rest,
    children: [],
    effectiveEngine: '',
    effectiveLevel,
  }
  return { node, children: [] }
}

function group(key: string, children: DisplayNode[], label = key): DisplayNode {
  const node: TreeNode = {
    kind: 'container',
    tag: 'group',
    key,
    attrs: { label },
    children: [],
    effectiveEngine: '',
    effectiveLevel: undefined,
  }
  return { node, children }
}

function criteria(partial: Partial<FilterCriteria>): FilterCriteria {
  return {
    ...DEFAULT_FILTER_CRITERIA,
    ...partial,
    stability: partial.stability ?? DEFAULT_FILTER_CRITERIA.stability,
    tags: partial.tags ?? DEFAULT_FILTER_CRITERIA.tags,
  }
}

function ids(nodes: DisplayNode[]): string[] {
  const out: string[] = []
  const walk = (list: DisplayNode[]) => {
    for (const d of list) {
      if (d.node.kind === 'component') out.push(d.node.componentId)
      walk(d.children)
    }
  }
  walk(nodes)
  return out
}

describe('levelFilterRank', () => {
  it('orders the ladder and maps restructure to blendWell', () => {
    expect(levelFilterRank('fixes')).toBe(0)
    expect(levelFilterRank('restoration')).toBe(1)
    expect(levelFilterRank('vanillaPlus')).toBe(2)
    expect(levelFilterRank('blendWell')).toBe(3)
    expect(levelFilterRank('restructure')).toBe(3)
    expect(levelFilterRank('quality')).toBe(4)
    expect(levelFilterRank('difficulty')).toBeNull()
    expect(levelFilterRank(undefined)).toBeNull()
  })
})

describe('levelPassesFilter', () => {
  it('passes everything when no ladder max is set', () => {
    expect(levelPassesFilter('difficulty', null, false, false)).toBe(true)
    expect(levelPassesFilter('quality', null, false, false)).toBe(true)
  })

  it('is cumulative by default', () => {
    expect(levelPassesFilter('fixes', 'vanillaPlus', false, false)).toBe(true)
    expect(levelPassesFilter('restoration', 'vanillaPlus', false, false)).toBe(true)
    expect(levelPassesFilter('vanillaPlus', 'vanillaPlus', false, false)).toBe(true)
    expect(levelPassesFilter('blendWell', 'vanillaPlus', false, false)).toBe(false)
    expect(levelPassesFilter('restructure', 'vanillaPlus', false, false)).toBe(false)
  })

  it('exact mode limits to the bucket (restructure with blendWell)', () => {
    expect(levelPassesFilter('fixes', 'blendWell', true, false)).toBe(false)
    expect(levelPassesFilter('blendWell', 'blendWell', true, false)).toBe(true)
    expect(levelPassesFilter('restructure', 'blendWell', true, false)).toBe(true)
    expect(levelPassesFilter('quality', 'blendWell', true, false)).toBe(false)
  })

  it('excludes difficulty unless includeDifficulty', () => {
    expect(levelPassesFilter('difficulty', 'quality', false, false)).toBe(false)
    expect(levelPassesFilter('difficulty', 'quality', false, true)).toBe(true)
  })

  it('always passes unleveled nodes when filtering', () => {
    expect(levelPassesFilter(undefined, 'fixes', true, false)).toBe(true)
  })
})

describe('normalizeStability', () => {
  it('treats missing and released as Released', () => {
    expect(normalizeStability(undefined)).toBe(STABILITY_RELEASED)
    expect(normalizeStability('')).toBe(STABILITY_RELEASED)
    expect(normalizeStability('released')).toBe(STABILITY_RELEASED)
    expect(normalizeStability('beta')).toBe('beta')
    expect(normalizeStability('alpha')).toBe('alpha')
  })
})

describe('filterDisplayTree', () => {
  const tree: DisplayNode[] = [
    group('g1', [
      component('a', { label: 'Alpha Fix', effectiveLevel: 'fixes' }),
      component('b', { label: 'Beta Quest', effectiveLevel: 'blendWell', tags: 'bigQuest' }),
      component('c', {
        label: 'Hard Mode',
        effectiveLevel: 'difficulty',
        stability: 'beta',
      }),
      component('d', {
        label: 'Hidden Req',
        required: true,
        noDisplay: true,
        effectiveLevel: 'fixes',
      }),
      component('reqVis', {
        label: 'Visible Required',
        required: true,
        effectiveLevel: 'fixes',
      }),
      component('e', {
        label: 'Restructure Pack',
        effectiveLevel: 'restructure',
        tags: 'smallQuest',
      }),
      component('f', { label: 'Plain', effectiveLevel: 'quality' }),
    ]),
  ]

  it('filters cumulatively by level (hidden still hidden by default)', () => {
    const out = filterDisplayTree(tree, criteria({ maxLevel: 'vanillaPlus' }))
    expect(ids(out)).toEqual(['a', 'reqVis'])
  })

  it('exact blendWell includes restructure', () => {
    const out = filterDisplayTree(
      tree,
      criteria({ maxLevel: 'blendWell', levelExact: true }),
    )
    expect(ids(out)).toEqual(['b', 'e'])
  })

  it('ORs difficulty when includeDifficulty', () => {
    const out = filterDisplayTree(
      tree,
      criteria({ maxLevel: 'fixes', includeDifficulty: true }),
    )
    expect(ids(out)).toEqual(['a', 'c', 'reqVis'])
  })

  it('filters stability Released vs beta', () => {
    const released = filterDisplayTree(
      tree,
      criteria({ stability: new Set([STABILITY_RELEASED]) }),
    )
    expect(ids(released)).toEqual(['a', 'b', 'reqVis', 'e', 'f'])

    const beta = filterDisplayTree(tree, criteria({ stability: new Set(['beta']) }))
    expect(ids(beta)).toEqual(['c'])
  })

  it('matches tags with OR', () => {
    const out = filterDisplayTree(
      tree,
      criteria({ tags: new Set(['bigQuest', 'smallQuest']) }),
    )
    expect(ids(out)).toEqual(['b', 'e'])
  })

  it('supports required only / hide', () => {
    expect(ids(filterDisplayTree(tree, criteria({ requiredMode: 'only' })))).toEqual([
      'reqVis',
    ])
    expect(
      ids(
        filterDisplayTree(
          tree,
          criteria({ requiredMode: 'only', hiddenMode: 'show' }),
        ),
      ),
    ).toEqual(['d', 'reqVis'])
    expect(ids(filterDisplayTree(tree, criteria({ requiredMode: 'hide' })))).toEqual([
      'a',
      'b',
      'c',
      'e',
      'f',
    ])
  })

  it('supports hidden only', () => {
    expect(ids(filterDisplayTree(tree, criteria({ hiddenMode: 'only' })))).toEqual(['d'])
  })

  it('searches label and id', () => {
    expect(ids(filterDisplayTree(tree, criteria({ search: 'quest' })))).toEqual(['b'])
    expect(ids(filterDisplayTree(tree, criteria({ search: 'Hard' })))).toEqual(['c'])
    expect(ids(filterDisplayTree(tree, criteria({ search: 'reqVis' })))).toEqual([
      'reqVis',
    ])
  })

  it('keeps ancestor groups for matching leaves', () => {
    const out = filterDisplayTree(tree, criteria({ maxLevel: 'fixes', levelExact: true }))
    expect(out).toHaveLength(1)
    expect(out[0].node.attrs.label).toBe('g1')
    expect(ids(out)).toEqual(['a', 'reqVis'])
  })
})
