import { describe, expect, it } from 'vitest'
import {
  levelFilterRank,
  levelPassesFilter,
} from '../levels'
import {
  STABILITY_RELEASED,
  capitalizeStabilityLabel,
  createDefaultFilterCriteria,
  cycleUncheckedFilter,
  filterDisplayTree,
  normalizeStability,
  stabilityBadgeLabel,
  uncheckedFilterLabel,
  type FilterCriteria,
  type FilterModContext,
} from '../selection/filterDisplayTree'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import type { DisplayNode } from '../selection/visibility'
import { buildDisplayTree } from '../selection/visibility'
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
    expect(levelFilterRank('lowerDifficulty')).toBeNull()
    expect(levelFilterRank('higherDifficulty')).toBeNull()
    expect(levelFilterRank(undefined)).toBeNull()
  })
})

const NO_DIFF = {
  includeLowerDifficulty: false,
  includeHigherDifficulty: false,
} as const

const ALL_DIFF = {
  includeLowerDifficulty: true,
  includeHigherDifficulty: true,
} as const

describe('levelPassesFilter', () => {
  it('passes non-difficulty levels when no ladder max is set', () => {
    expect(levelPassesFilter('extended', null, false, NO_DIFF)).toBe(true)
    expect(levelPassesFilter(undefined, null, false, NO_DIFF)).toBe(true)
  })

  it('is cumulative by default', () => {
    expect(levelPassesFilter('fixes', 'vanillaPlus', false, NO_DIFF)).toBe(true)
    expect(levelPassesFilter('restoration', 'vanillaPlus', false, NO_DIFF)).toBe(true)
    expect(levelPassesFilter('vanillaPlus', 'vanillaPlus', false, NO_DIFF)).toBe(true)
    expect(levelPassesFilter('blendWell', 'vanillaPlus', false, NO_DIFF)).toBe(false)
    expect(levelPassesFilter('restructure', 'vanillaPlus', false, NO_DIFF)).toBe(false)
  })

  it('exact mode limits to the bucket (restructure with blendWell)', () => {
    expect(levelPassesFilter('fixes', 'blendWell', true, NO_DIFF)).toBe(false)
    expect(levelPassesFilter('blendWell', 'blendWell', true, NO_DIFF)).toBe(true)
    expect(levelPassesFilter('restructure', 'blendWell', true, NO_DIFF)).toBe(true)
    expect(levelPassesFilter('extended', 'blendWell', true, NO_DIFF)).toBe(false)
  })

  it('excludes difficulty tokens unless their include flag is on', () => {
    expect(levelPassesFilter('higherDifficulty', 'extended', false, NO_DIFF)).toBe(false)
    expect(
      levelPassesFilter('higherDifficulty', 'extended', false, {
        includeLowerDifficulty: false,
        includeHigherDifficulty: true,
      }),
    ).toBe(true)
    expect(levelPassesFilter('lowerDifficulty', null, false, NO_DIFF)).toBe(false)
    expect(
      levelPassesFilter('lowerDifficulty', null, false, {
        includeLowerDifficulty: true,
        includeHigherDifficulty: false,
      }),
    ).toBe(true)
    expect(
      levelPassesFilter('higherDifficulty', null, false, {
        includeLowerDifficulty: true,
        includeHigherDifficulty: false,
      }),
    ).toBe(false)
  })

  it('excludes unleveled nodes when filtering by level', () => {
    expect(levelPassesFilter(undefined, 'fixes', true, NO_DIFF)).toBe(false)
    expect(levelPassesFilter(undefined, 'extended', false, ALL_DIFF)).toBe(false)
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
        effectiveLevel: 'higherDifficulty',
      }),
      component('cLow', {
        label: 'Mild Mode',
        effectiveLevel: 'lowerDifficulty',
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

  it('filters cumulatively by level (required/hidden excluded by defaults)', () => {
    const out = filterDisplayTree(
      tree,
      criteria({
        maxLevel: 'vanillaPlus',
        includeLowerDifficulty: false,
        includeHigherDifficulty: false,
      }),
    )
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
      criteria({
        maxLevel: 'blendWell',
        levelExact: true,
        includeLowerDifficulty: false,
        includeHigherDifficulty: false,
      }),
    )
    expect(ids(out)).toEqual(['b', 'e'])
  })

  it('ORs difficulty tokens when their include flags are on', () => {
    const out = filterDisplayTree(
      tree,
      criteria({
        maxLevel: 'fixes',
        includeLowerDifficulty: true,
        includeHigherDifficulty: true,
      }),
    )
    expect(ids(out)).toEqual(['a', 'c', 'cLow'])
  })

  it('hides difficulty under All levels when include flags are off', () => {
    const withDiff = filterDisplayTree(
      tree,
      criteria({
        maxLevel: null,
        includeLowerDifficulty: true,
        includeHigherDifficulty: true,
      }),
    )
    expect(ids(withDiff)).toContain('c')
    expect(ids(withDiff)).toContain('cLow')
    expect(ids(withDiff)).toContain('a')
    expect(ids(withDiff)).toContain('nolevel')

    const withoutDiff = filterDisplayTree(
      tree,
      criteria({
        maxLevel: null,
        includeLowerDifficulty: false,
        includeHigherDifficulty: false,
      }),
    )
    expect(ids(withoutDiff)).not.toContain('c')
    expect(ids(withoutDiff)).not.toContain('cLow')
    expect(ids(withoutDiff)).toContain('a')
    expect(ids(withoutDiff)).toContain('nolevel')
  })

  it('always includes components regardless of catalog stability', () => {
    const out = filterDisplayTree(tree, criteria())
    expect(ids(out)).toContain('c')
    expect(ids(out)).toEqual(['a', 'b', 'c', 'cLow', 'e', 'f', 'nolevel'])
  })

  it('tag allow-list: unchecking hides that tag; untagged still show', () => {
    const withoutBig = filterDisplayTree(
      tree,
      criteria({ tags: new Set(['smallQuest']) }),
    )
    expect(ids(withoutBig)).toEqual(['a', 'c', 'cLow', 'e', 'f', 'nolevel'])
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

  it('showHidden reveals both hidden and required components', () => {
    expect(ids(filterDisplayTree(tree, criteria()))).toEqual([
      'a',
      'b',
      'c',
      'cLow',
      'e',
      'f',
      'nolevel',
    ])
    expect(ids(filterDisplayTree(tree, criteria({ showHidden: true })))).toEqual([
      'a',
      'b',
      'c',
      'cLow',
      'd',
      'reqVis',
      'e',
      'f',
      'nolevel',
    ])
  })

  it('searches label and id', () => {
    expect(ids(filterDisplayTree(tree, criteria({ search: 'quest' })))).toEqual(['b'])
    expect(
      ids(filterDisplayTree(tree, criteria({ search: 'Hard' }))),
    ).toEqual(['c'])
    expect(
      ids(
        filterDisplayTree(
          tree,
          criteria({ search: 'reqVis', showHidden: true }),
        ),
      ),
    ).toEqual(['reqVis'])
  })

  it('matches component id exactly, not as substring', () => {
    const withId: DisplayNode[] = [
      group('g', [
        component('uniqueCompId:99', {
          label: 'Plain Leaf',
          effectiveLevel: 'fixes',
        }),
      ]),
    ]
    expect(
      ids(filterDisplayTree(withId, criteria({ search: 'uniqueCompId' }))),
    ).toEqual([])
    expect(
      ids(filterDisplayTree(withId, criteria({ search: 'uniqueCompId:99' }))),
    ).toEqual(['uniqueCompId:99'])
  })

  it('searches parent node labels and keeps matching descendants', () => {
    expect(ids(filterDisplayTree(tree, criteria({ search: 'g1' })))).toEqual([
      'a',
      'b',
      'c',
      'cLow',
      'e',
      'f',
      'nolevel',
    ])
    expect(
      ids(
        filterDisplayTree(
          tree,
          criteria({
            search: 'g1',
            maxLevel: 'fixes',
            levelExact: true,
            includeLowerDifficulty: false,
            includeHigherDifficulty: false,
          }),
        ),
      ),
    ).toEqual(['a'])

    const nested: DisplayNode[] = [
      group(
        'outer',
        [
          group(
            'inner-mod',
            [
              component('x', { label: 'Leaf One', effectiveLevel: 'fixes' }),
              component('y', { label: 'Leaf Two', effectiveLevel: 'extended' }),
            ],
            'Reflections of Destiny',
          ),
          component('z', { label: 'Sibling', effectiveLevel: 'fixes' }),
        ],
        'Content',
      ),
    ]
    expect(
      ids(filterDisplayTree(nested, criteria({ search: 'destiny' }))),
    ).toEqual(['x', 'y'])
    expect(
      ids(filterDisplayTree(nested, criteria({ search: 'content' }))),
    ).toEqual(['x', 'y', 'z'])
  })

  it('keeps beta and released components visible (no stability filter)', () => {
    const { model } = parseInstallSequence(`<?xml version="1.0"?>
<installSequence>
  <content>
    <mod id="Reflections-of-Destiny" label="Reflections of Destiny">
      <component id="Reflections_of_Destiny:100" label="The Future is Now" />
      <component id="Reflections_of_Destiny:110" label="The Mirror Shard" />
    </mod>
    <mod id="ok-mod" label="Ok">
      <component id="ok:1" label="Released Comp" />
    </mod>
  </content>
</installSequence>`)
    const display: DisplayNode[] = model.componentsInOrder.map((c) => ({
      node: c,
      children: [],
    }))
    expect(ids(filterDisplayTree(display, criteria()))).toEqual([
      'Reflections_of_Destiny:100',
      'Reflections_of_Destiny:110',
      'ok:1',
    ])
  })

  it('keeps ancestor groups for matching leaves', () => {
    const out = filterDisplayTree(
      tree,
      criteria({
        maxLevel: 'fixes',
        levelExact: true,
        includeLowerDifficulty: false,
        includeHigherDifficulty: false,
      }),
    )
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
        name: '',
        abbreviation: '',
        category: '',
        url: '',
        readme: '',
        release: '',
        version: '',
        sizeBytes: 100,
        author: 'SoloDev',
        type: '',
        stability: '',
      },
    ],
    [
      'mid',
      {
        codename: 'mid',
        name: '',
        abbreviation: '',
        category: '',
        url: '',
        readme: '',
        release: '',
        version: '',
        sizeBytes: 500,
        author: 'Lava',
        type: '',
        stability: '',
      },
    ],
    [
      'big',
      {
        codename: 'big',
        name: '',
        abbreviation: '',
        category: '',
        url: '',
        readme: '',
        release: '',
        version: '',
        sizeBytes: 1000,
        author: 'Argent77',
        type: '',
        stability: '',
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

describe('cycleUncheckedFilter', () => {
  it('cycles off → withOptions → only → dependencies → off', () => {
    expect(cycleUncheckedFilter('off')).toBe('withOptions')
    expect(cycleUncheckedFilter('withOptions')).toBe('only')
    expect(cycleUncheckedFilter('only')).toBe('dependencies')
    expect(cycleUncheckedFilter('dependencies')).toBe('off')
  })

  it('labels match chip copy', () => {
    expect(uncheckedFilterLabel('off')).toBe('Unchecked')
    expect(uncheckedFilterLabel('withOptions')).toBe('Unchecked + options')
    expect(uncheckedFilterLabel('only')).toBe('Unchecked only')
    expect(uncheckedFilterLabel('dependencies')).toBe('Unchecked dependencies')
  })
})

describe('unchecked filter modes', () => {
  const XML = `<?xml version="1.0"?>
<installSequence>
  <base label="Base" engine="bg1">
    <mod id="Plain" label="Plain">
      <component id="plain:a" label="Alpha" />
      <component id="plain:b" label="Beta" />
      <component id="plain:c" label="Gamma" />
    </mod>
    <alternatives label="Pick one">
      <component id="alt:1" label="Option One" default="1" />
      <component id="alt:2" label="Option Two" />
      <component id="alt:3" label="Option Three" />
    </alternatives>
  </base>
</installSequence>`

  const { model } = parseInstallSequence(XML)
  const base = model.stations.find((s) => s.stationId === 'base')!
  const built = buildDisplayTree(base.children, {
    game: 'bg1',
    selectedIds: new Set(),
  })

  it('withOptions: hides fully checked leaves and keeps unchecked siblings', () => {
    const selected = new Set(['plain:a'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'withOptions' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['plain:b', 'plain:c', 'alt:1', 'alt:2', 'alt:3'])
  })

  it('withOptions: keeps entire alternatives group when one option is checked', () => {
    const selected = new Set(['alt:1', 'plain:a', 'plain:b', 'plain:c'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'withOptions' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['alt:1', 'alt:2', 'alt:3'])
    const alts = out.find((d) => d.node.kind === 'alternatives')
    expect(alts?.children.map((c) => (c.node as ComponentNode).componentId)).toEqual([
      'alt:1',
      'alt:2',
      'alt:3',
    ])
  })

  it('only: hides decided alternatives groups; keeps undecided ones whole', () => {
    const selected = new Set(['alt:1', 'plain:a'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'only' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['plain:b', 'plain:c'])
  })

  it('only: keeps undecided alternatives with all options', () => {
    const selected = new Set(['plain:a'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'only' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['plain:b', 'plain:c', 'alt:1', 'alt:2', 'alt:3'])
  })

  it('only: still applies search inside undecided alternatives', () => {
    const selected = new Set(['plain:a'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'only', search: 'Two' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['alt:2'])
  })

  it('only: search does not revive a decided alternatives group', () => {
    const selected = new Set(['alt:1'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'only', search: 'Two' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual([])
  })

  it('withOptions: still applies search inside alternatives', () => {
    const selected = new Set(['alt:1'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'withOptions', search: 'Two' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['alt:2'])
  })

  it('indeterminate parent keeps unchecked siblings', () => {
    const selected = new Set(['plain:a'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'withOptions' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    const plain = out.find((d) => d.node.attrs.label === 'Plain')
    expect(plain).toBeDefined()
    expect(ids([plain!])).toEqual(['plain:b', 'plain:c'])
  })

  it('off by default: checked leaves remain visible', () => {
    const selected = new Set(['plain:a', 'alt:1'])
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'off' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['plain:a', 'plain:b', 'plain:c', 'alt:1', 'alt:2', 'alt:3'])
  })
})

describe('unchecked dependencies filter', () => {
  const XML = `<?xml version="1.0"?>
<installSequence>
  <base label="Base" engine="bg1">
    <mod id="Gate" label="Gate">
      <component id="gate:1" label="Gate Component" />
    </mod>
    <mod id="Plain" label="Plain">
      <component id="plain:a" label="Always Visible" />
    </mod>
    <mod id="Gated" label="Gated">
      <component id="gated:a" label="Direct Gated" displayIf="gate:1" />
      <component id="gated:b" label="Direct Gated Checked" displayIf="gate:1" />
    </mod>
    <group label="Gated Group" displayIf="gate:1">
      <component id="child:a" label="Ancestor Gated Child A" />
      <component id="child:b" label="Ancestor Gated Child B" />
    </group>
    <alternatives label="Gated Alts" displayIf="gate:1">
      <component id="alt:1" label="Option One" default="1" />
      <component id="alt:2" label="Option Two" />
      <component id="alt:3" label="Option Three" />
    </alternatives>
  </base>
</installSequence>`

  const { model } = parseInstallSequence(XML)
  const base = model.stations.find((s) => s.stationId === 'base')!

  it('hides always-visible unchecked leaves; keeps unchecked displayIf-gated leaves', () => {
    const selected = new Set(['gate:1'])
    const built = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: selected,
    })
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'dependencies' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual([
      'gated:a',
      'gated:b',
      'child:a',
      'child:b',
      'alt:1',
      'alt:2',
      'alt:3',
    ])
  })

  it('hides checked gated leaves', () => {
    const selected = new Set(['gate:1', 'gated:b'])
    const built = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: selected,
    })
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'dependencies' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual([
      'gated:a',
      'child:a',
      'child:b',
      'alt:1',
      'alt:2',
      'alt:3',
    ])
  })

  it('keeps full gated alternatives including the checked option', () => {
    const selected = new Set(['gate:1', 'alt:1'])
    const built = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: selected,
    })
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'dependencies' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual([
      'gated:a',
      'gated:b',
      'child:a',
      'child:b',
      'alt:1',
      'alt:2',
      'alt:3',
    ])
    const alts = out.find((d) => d.node.kind === 'alternatives')
    expect(alts?.children.map((c) => (c.node as ComponentNode).componentId)).toEqual([
      'alt:1',
      'alt:2',
      'alt:3',
    ])
  })

  it('keeps child without its own displayIf under a gated parent', () => {
    const selected = new Set(['gate:1'])
    const built = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: selected,
    })
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'dependencies' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toContain('child:a')
    expect(ids(out)).toContain('child:b')
    expect(ids(out)).not.toContain('plain:a')
  })
})

describe('unchecked dependencies: per-option displayIf in alternatives', () => {
  const XML = `<?xml version="1.0"?>
<installSequence>
  <base label="Base" engine="bg1">
    <mod id="Gate" label="Gate">
      <component id="gate:1" label="Gate Component" />
    </mod>
    <alternatives label="Make Infravision Useful">
      <component id="luke:1" label="Luke Solution" displayIf="gate:1" />
      <component id="olvyn:std" label="Olvyn Standard" default="1" />
      <component id="olvyn:light" label="Olvyn Light" />
    </alternatives>
    <alternatives label="Always Visible Alts">
      <component id="plain-alt:1" label="Plain One" default="1" />
      <component id="plain-alt:2" label="Plain Two" />
    </alternatives>
  </base>
</installSequence>`

  const { model } = parseInstallSequence(XML)
  const base = model.stations.find((s) => s.stationId === 'base')!

  it('keeps always-visible alternatives with an unchecked displayIf option (full list)', () => {
    const selected = new Set(['gate:1', 'olvyn:std'])
    const built = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: selected,
    })
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'dependencies' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual(['luke:1', 'olvyn:std', 'olvyn:light'])
    const alts = out.find((d) => d.node.attrs.label === 'Make Infravision Useful')
    expect(alts?.children.map((c) => (c.node as ComponentNode).componentId)).toEqual([
      'luke:1',
      'olvyn:std',
      'olvyn:light',
    ])
  })

  it('drops the group when its only displayIf option is already checked', () => {
    const selected = new Set(['gate:1', 'luke:1'])
    const built = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: selected,
    })
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'dependencies' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).toEqual([])
  })

  it('drops always-visible alternatives with no displayIf options', () => {
    const selected = new Set(['gate:1'])
    const built = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: selected,
    })
    const out = filterDisplayTree(
      built,
      criteria({ uncheckedFilter: 'dependencies' }),
      undefined,
      {},
      { selectedIds: selected, game: 'bg1' },
    )
    expect(ids(out)).not.toContain('plain-alt:1')
    expect(ids(out)).not.toContain('plain-alt:2')
    expect(ids(out)).toContain('luke:1')
  })
})
