import { describe, expect, it } from 'vitest'
import {
  levelFilterRank,
  levelPassesFilter,
} from '../levels'
import {
  STABILITY_RELEASED,
  capitalizeStabilityLabel,
  createDefaultFilterCriteria,
  filterDisplayTree,
  normalizeStability,
  stabilityBadgeLabel,
  type FilterCriteria,
  type FilterModContext,
} from '../selection/filterDisplayTree'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import type { DisplayNode } from '../selection/visibility'
import type { ComponentNode, InstallSequenceModel, TreeNode } from '../xml/schema'
import type { ModInfo } from '../mods/loadMods'

const ALL_TEST_TAGS = ['bigQuest', 'smallQuest']

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

function criteria(partial: Partial<FilterCriteria> = {}): FilterCriteria {
  const base = createDefaultFilterCriteria(ALL_TEST_TAGS)
  return {
    ...base,
    ...partial,
    stability: partial.stability ?? base.stability,
    tags: partial.tags ?? base.tags,
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
    expect(levelFilterRank('extended')).toBe(4)
    expect(levelFilterRank('difficulty')).toBeNull()
    expect(levelFilterRank(undefined)).toBeNull()
  })
})

describe('levelPassesFilter', () => {
  it('passes non-difficulty levels when no ladder max is set', () => {
    expect(levelPassesFilter('extended', null, false, false)).toBe(true)
    expect(levelPassesFilter(undefined, null, false, false)).toBe(true)
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
    expect(levelPassesFilter('extended', 'blendWell', true, false)).toBe(false)
  })

  it('excludes difficulty unless includeDifficulty', () => {
    expect(levelPassesFilter('difficulty', 'extended', false, false)).toBe(false)
    expect(levelPassesFilter('difficulty', 'extended', false, true)).toBe(true)
    expect(levelPassesFilter('difficulty', null, false, false)).toBe(false)
    expect(levelPassesFilter('difficulty', null, false, true)).toBe(true)
  })

  it('excludes unleveled nodes when filtering by level', () => {
    expect(levelPassesFilter(undefined, 'fixes', true, false)).toBe(false)
    expect(levelPassesFilter(undefined, 'extended', false, true)).toBe(false)
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

describe('stability labels', () => {
  it('capitalizes non-released tokens for display', () => {
    expect(capitalizeStabilityLabel('beta')).toBe('Beta')
    expect(capitalizeStabilityLabel('alpha')).toBe('Alpha')
    expect(stabilityBadgeLabel('beta')).toBe('Beta')
    expect(stabilityBadgeLabel(undefined)).toBeNull()
    expect(stabilityBadgeLabel('released')).toBeNull()
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
      component('f', { label: 'Plain', effectiveLevel: 'extended' }),
      component('nolevel', { label: 'No Level Item' }),
    ]),
  ]

  it('filters cumulatively by level (required/hidden/beta excluded by defaults)', () => {
    const out = filterDisplayTree(tree, criteria({ maxLevel: 'vanillaPlus' }))
    expect(ids(out)).toEqual(['a'])
  })

  it('excludes unleveled when a level filter is active', () => {
    const out = filterDisplayTree(tree, criteria({ maxLevel: 'extended' }))
    expect(ids(out)).not.toContain('nolevel')
    expect(ids(out)).toContain('a')
    expect(ids(out)).toContain('f')
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
      criteria({
        maxLevel: 'fixes',
        includeDifficulty: true,
        stability: new Set([STABILITY_RELEASED, 'beta']),
      }),
    )
    expect(ids(out)).toEqual(['a', 'c'])
  })

  it('hides difficulty under All levels when includeDifficulty is off', () => {
    const withDiff = filterDisplayTree(
      tree,
      criteria({
        maxLevel: null,
        includeDifficulty: true,
        stability: new Set([STABILITY_RELEASED, 'beta']),
      }),
    )
    expect(ids(withDiff)).toContain('c')
    expect(ids(withDiff)).toContain('a')
    expect(ids(withDiff)).toContain('nolevel')

    const withoutDiff = filterDisplayTree(
      tree,
      criteria({
        maxLevel: null,
        includeDifficulty: false,
        stability: new Set([STABILITY_RELEASED, 'beta']),
      }),
    )
    expect(ids(withoutDiff)).not.toContain('c')
    expect(ids(withoutDiff)).toContain('a')
    expect(ids(withoutDiff)).toContain('nolevel')
  })

  it('filters stability Released vs beta', () => {
    const released = filterDisplayTree(
      tree,
      criteria({ stability: new Set([STABILITY_RELEASED]) }),
    )
    expect(ids(released)).toEqual(['a', 'b', 'e', 'f', 'nolevel'])

    const beta = filterDisplayTree(tree, criteria({ stability: new Set(['beta']) }))
    expect(ids(beta)).toEqual(['c'])
  })

  it('tag allow-list: unchecking hides that tag; untagged still show', () => {
    const withoutBig = filterDisplayTree(
      tree,
      criteria({ tags: new Set(['smallQuest']) }),
    )
    expect(ids(withoutBig)).toEqual(['a', 'e', 'f', 'nolevel'])
  })

  it('only checked tags hides untagged', () => {
    const out = filterDisplayTree(
      tree,
      criteria({
        tags: new Set(['bigQuest', 'smallQuest']),
        tagsOnlyChecked: true,
      }),
    )
    expect(ids(out)).toEqual(['b', 'e'])
  })

  it('showRequired toggles required components', () => {
    expect(ids(filterDisplayTree(tree, criteria()))).toEqual([
      'a',
      'b',
      'e',
      'f',
      'nolevel',
    ])
    expect(
      ids(filterDisplayTree(tree, criteria({ showRequired: true }))),
    ).toEqual(['a', 'b', 'reqVis', 'e', 'f', 'nolevel'])
    expect(
      ids(
        filterDisplayTree(
          tree,
          criteria({ showRequired: true, showHidden: true }),
        ),
      ),
    ).toEqual(['a', 'b', 'd', 'reqVis', 'e', 'f', 'nolevel'])
  })

  it('showHidden includes noDisplay components', () => {
    expect(
      ids(
        filterDisplayTree(
          tree,
          criteria({ showHidden: true, showRequired: true }),
        ),
      ),
    ).toContain('d')
    expect(ids(filterDisplayTree(tree, criteria({ showHidden: true })))).not.toContain(
      'd',
    )
  })

  it('searches label and id', () => {
    expect(ids(filterDisplayTree(tree, criteria({ search: 'quest' })))).toEqual(['b'])
    expect(
      ids(
        filterDisplayTree(
          tree,
          criteria({
            search: 'Hard',
            stability: new Set([STABILITY_RELEASED, 'beta']),
          }),
        ),
      ),
    ).toEqual(['c'])
    expect(
      ids(
        filterDisplayTree(
          tree,
          criteria({ search: 'reqVis', showRequired: true }),
        ),
      ),
    ).toEqual(['reqVis'])
  })

  it('excludes children that inherit mod-level beta when Released-only', () => {
    const { model } = parseInstallSequence(`<?xml version="1.0"?>
<installSequence>
  <content>
    <mod id="Reflections-of-Destiny" label="Reflections of Destiny" stability="beta">
      <component id="Reflections_of_Destiny:100" label="The Future is Now" />
      <component id="Reflections_of_Destiny:110" label="The Mirror Shard" />
    </mod>
    <mod id="ok-mod" label="Ok">
      <component id="ok:1" label="Released Comp" />
    </mod>
  </content>
</installSequence>`)
    expect(model.componentsById.get('Reflections_of_Destiny:100')?.attrs.stability).toBe(
      'beta',
    )
    const display: DisplayNode[] = model.componentsInOrder.map((c) => ({
      node: c,
      children: [],
    }))
    expect(
      ids(filterDisplayTree(display, criteria({ stability: new Set([STABILITY_RELEASED]) }))),
    ).toEqual(['ok:1'])
    expect(
      ids(
        filterDisplayTree(
          display,
          criteria({ stability: new Set([STABILITY_RELEASED, 'beta']) }),
        ),
      ),
    ).toEqual(['Reflections_of_Destiny:100', 'Reflections_of_Destiny:110', 'ok:1'])
  })

  it('keeps ancestor groups for matching leaves', () => {
    const out = filterDisplayTree(tree, criteria({ maxLevel: 'fixes', levelExact: true }))
    expect(out).toHaveLength(1)
    expect(out[0].node.attrs.label).toBe('g1')
    expect(ids(out)).toEqual(['a'])
  })
})

describe('filterDisplayTree size and author', () => {
  const AUTHOR_OPTIONS = ['Lava', 'Argent77']
  const SIZE_BOUNDS = { min: 100, max: 1000 }

  function modComponent(
    id: string,
    modId: string,
    attrs: ComponentNode['attrs'] & { effectiveLevel?: string } = {},
  ): DisplayNode {
    return component(id, { ...attrs, modId, effectiveLevel: attrs.effectiveLevel ?? 'fixes' })
  }

  function modelFor(...nodes: ComponentNode[]): InstallSequenceModel {
    const nodesByKey = new Map(nodes.map((n) => [n.key, n]))
    return {
      stations: [],
      componentsById: new Map(nodes.map((n) => [n.componentId, n])),
      componentsInOrder: nodes,
      nodesByKey,
    }
  }

  const modsByCodename = new Map<string, ModInfo>([
    [
      'small',
      {
        codename: 'small',
        url: '',
        release: '',
        version: '',
        sizeBytes: 100,
        author: 'SoloDev',
      },
    ],
    [
      'mid',
      {
        codename: 'mid',
        url: '',
        release: '',
        version: '',
        sizeBytes: 500,
        author: 'Lava',
      },
    ],
    [
      'big',
      {
        codename: 'big',
        url: '',
        release: '',
        version: '',
        sizeBytes: 1000,
        author: 'Argent77',
      },
    ],
  ])

  const leaves = [
    modComponent('s', 'small'),
    modComponent('m', 'mid'),
    modComponent('b', 'big'),
    component('orphan', { label: 'No Mod', effectiveLevel: 'fixes' }),
  ]
  const sizeTree: DisplayNode[] = [group('g', leaves)]
  const ctx: FilterModContext = {
    model: modelFor(
      ...leaves.map((d) => d.node as ComponentNode),
    ),
    modsByCodename,
  }
  const seed = { authorOptions: AUTHOR_OPTIONS, sizeBounds: SIZE_BOUNDS }

  function sizeCriteria(partial: Partial<FilterCriteria> = {}): FilterCriteria {
    return criteria({
      sizeMinBytes: SIZE_BOUNDS.min,
      sizeMaxBytes: SIZE_BOUNDS.max,
      authors: new Set(AUTHOR_OPTIONS),
      authorMode: 'include',
      ...partial,
    })
  }

  it('size range filters by bytes; full range keeps all with mods', () => {
    expect(ids(filterDisplayTree(sizeTree, sizeCriteria(), ctx, seed))).toEqual([
      's',
      'm',
      'b',
      'orphan',
    ])
    expect(
      ids(
        filterDisplayTree(
          sizeTree,
          sizeCriteria({ sizeMinBytes: 400, sizeMaxBytes: 600 }),
          ctx,
          seed,
        ),
      ),
    ).toEqual(['m'])
  })

  it('hides nodes without size when size range is narrowed', () => {
    expect(
      ids(
        filterDisplayTree(
          sizeTree,
          sizeCriteria({ sizeMinBytes: 100, sizeMaxBytes: 1000 }),
          ctx,
          seed,
        ),
      ),
    ).toEqual(['s', 'm', 'b', 'orphan'])
    expect(
      ids(
        filterDisplayTree(
          sizeTree,
          sizeCriteria({ sizeMinBytes: 100, sizeMaxBytes: 999 }),
          ctx,
          seed,
        ),
      ),
    ).toEqual(['s', 'm'])
  })

  it('author include: all selected is inactive (unlisted authors pass)', () => {
    expect(
      ids(filterDisplayTree(sizeTree, sizeCriteria(), ctx, seed)),
    ).toEqual(['s', 'm', 'b', 'orphan'])
  })

  it('author include: partial selection keeps only selected authors', () => {
    expect(
      ids(
        filterDisplayTree(
          sizeTree,
          sizeCriteria({ authors: new Set(['Lava']) }),
          ctx,
          seed,
        ),
      ),
    ).toEqual(['m'])
  })

  it('author exclude: hides selected authors; unlisted pass', () => {
    expect(
      ids(
        filterDisplayTree(
          sizeTree,
          sizeCriteria({
            authorMode: 'exclude',
            authors: new Set(['Lava']),
          }),
          ctx,
          seed,
        ),
      ),
    ).toEqual(['s', 'b', 'orphan'])
  })

  it('author exclude with empty selection is inactive', () => {
    expect(
      ids(
        filterDisplayTree(
          sizeTree,
          sizeCriteria({ authorMode: 'exclude', authors: new Set() }),
          ctx,
          seed,
        ),
      ),
    ).toEqual(['s', 'm', 'b', 'orphan'])
  })
})
