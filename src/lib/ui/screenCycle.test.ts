import { describe, expect, it } from 'vitest'
import type { DisplayNode } from '../selection/visibility'
import type { ComponentNode, TreeNode } from '../xml/schema'
import {
  advancePastMissingScreen,
  buildNavigableScreens,
  cycleScreen,
  expandStationToScreens,
  navScreensEqual,
  type NavScreen,
} from './screenCycle'

function component(id: string): DisplayNode {
  const node: ComponentNode = {
    kind: 'component',
    tag: 'component',
    key: id,
    componentId: id,
    orderIndex: 0,
    attrs: {},
    children: [],
    effectiveEngine: '',
  }
  return { node, children: [] }
}

function branch(
  key: string,
  tag: string,
  children: DisplayNode[],
  label = key,
): DisplayNode {
  const node: TreeNode = {
    kind: 'container',
    tag,
    key,
    attrs: { label },
    children: [],
    effectiveEngine: '',
  }
  return { node, children }
}

describe('expandStationToScreens', () => {
  it('emits one screen for a non-content station with rows', () => {
    expect(expandStationToScreens('base', [component('a')])).toEqual([
      { stationId: 'base' },
    ])
  })

  it('omits a non-content station with an empty filtered tree', () => {
    expect(expandStationToScreens('ui', [])).toEqual([])
  })

  it('expands content as main → ordered subs, skipping empty subs', () => {
    const tree = [
      branch('bg1', 'group', [
        branch('bg1-items', 'items', [component('i1')]),
        branch('bg1-npc', 'npc', [component('n1')]),
        branch('bg1-quest', 'quest', []), // empty after filters
      ]),
      branch('bg2', 'group', [
        branch('bg2-tweaks', 'tweaks', [component('t1')]),
      ]),
    ]
    expect(expandStationToScreens('content', tree)).toEqual([
      {
        stationId: 'content',
        mainKey: 'bg1',
        subKey: 'bg1-npc',
        subTag: 'npc',
      },
      {
        stationId: 'content',
        mainKey: 'bg1',
        subKey: 'bg1-items',
        subTag: 'items',
      },
      {
        stationId: 'content',
        mainKey: 'bg2',
        subKey: 'bg2-tweaks',
        subTag: 'tweaks',
      },
    ])
  })

  it('expands mechanics as first-level categories, skipping empty ones', () => {
    const tree = [
      branch('warriors', 'warriors', [component('w1')]),
      branch('rogues', 'rogues', []),
      branch('stats', 'stats', [component('s1')]),
    ]
    expect(expandStationToScreens('mechanics', tree)).toEqual([
      { stationId: 'mechanics', mainKey: 'warriors' },
      { stationId: 'mechanics', mainKey: 'stats' },
    ])
  })
})

describe('buildNavigableScreens', () => {
  it('follows station order and never includes engine', () => {
    const screens = buildNavigableScreens(['base', 'content', 'spells'], (id) => {
      if (id === 'base') return [component('b')]
      if (id === 'spells') return []
      return [
        branch('m', 'group', [branch('m-quest', 'quest', [component('q')])]),
      ]
    })
    expect(screens).toEqual([
      { stationId: 'base' },
      {
        stationId: 'content',
        mainKey: 'm',
        subKey: 'm-quest',
        subTag: 'quest',
      },
    ])
    expect(screens.every((s) => s.stationId !== ('engine' as never))).toBe(true)
  })
})

describe('cycleScreen', () => {
  const screens: NavScreen[] = [
    { stationId: 'base' },
    {
      stationId: 'content',
      mainKey: 'm',
      subKey: 's',
      subTag: 'quest',
    },
    { stationId: 'spells' },
  ]

  it('wraps forward and backward', () => {
    expect(cycleScreen(screens, screens[0]!, 1)).toEqual(screens[1])
    expect(cycleScreen(screens, screens[2]!, 1)).toEqual(screens[0])
    expect(cycleScreen(screens, screens[0]!, -1)).toEqual(screens[2])
  })

  it('from null (Engine) goes first on Next and last on Previous', () => {
    expect(cycleScreen(screens, null, 1)).toEqual(screens[0])
    expect(cycleScreen(screens, null, -1)).toEqual(screens[2])
  })

  it('returns null when there are no screens', () => {
    expect(cycleScreen([], null, 1)).toBeNull()
  })

  it('skips finished stations and keeps order relative to current', () => {
    const skip = (s: NavScreen) => s.stationId === 'content'
    expect(cycleScreen(screens, screens[0]!, 1, skip)).toEqual(screens[2])
    expect(cycleScreen(screens, screens[2]!, 1, skip)).toEqual(screens[0])
    expect(cycleScreen(screens, screens[1]!, 1, skip)).toEqual(screens[2])
  })

  it('OK-style skip of current station jumps past remaining tabs of that station', () => {
    const contentScreens: NavScreen[] = [
      { stationId: 'base' },
      {
        stationId: 'content',
        mainKey: 'm1',
        subKey: 's1',
        subTag: 'quest',
      },
      {
        stationId: 'content',
        mainKey: 'm1',
        subKey: 's2',
        subTag: 'npc',
      },
      { stationId: 'spells' },
    ]
    const skip = (s: NavScreen) => s.stationId === 'content'
    expect(cycleScreen(contentScreens, contentScreens[1]!, 1, skip)).toEqual(
      contentScreens[3],
    )
  })

  it('returns null when every screen is skipped', () => {
    expect(cycleScreen(screens, screens[0]!, 1, () => true)).toBeNull()
  })
})

describe('navScreensEqual', () => {
  it('matches content by main/sub keys only', () => {
    expect(
      navScreensEqual(
        { stationId: 'content', mainKey: 'a', subKey: 'b', subTag: 'npc' },
        { stationId: 'content', mainKey: 'a', subKey: 'b', subTag: 'items' },
      ),
    ).toBe(true)
    expect(
      navScreensEqual(
        { stationId: 'content', mainKey: 'a', subKey: 'b', subTag: 'npc' },
        { stationId: 'content', mainKey: 'a', subKey: 'c', subTag: 'npc' },
      ),
    ).toBe(false)
  })

  it('matches mechanics by main key', () => {
    expect(
      navScreensEqual(
        { stationId: 'mechanics', mainKey: 'warriors' },
        { stationId: 'mechanics', mainKey: 'warriors' },
      ),
    ).toBe(true)
    expect(
      navScreensEqual(
        { stationId: 'mechanics', mainKey: 'warriors' },
        { stationId: 'mechanics', mainKey: 'rogues' },
      ),
    ).toBe(false)
  })
})

describe('advancePastMissingScreen', () => {
  const a: NavScreen = { stationId: 'base' }
  const b: NavScreen = {
    stationId: 'content',
    mainKey: 'm',
    subKey: 's1',
    subTag: 'quest',
  }
  const c: NavScreen = {
    stationId: 'content',
    mainKey: 'm',
    subKey: 's2',
    subTag: 'tweaks',
  }
  const d: NavScreen = { stationId: 'spells' }
  const previous = [a, b, c, d]

  it('advances to the next remaining screen, not the first', () => {
    expect(advancePastMissingScreen(previous, c, [a, b, d])).toEqual(d)
  })

  it('wraps from the last stop to the first remaining', () => {
    expect(advancePastMissingScreen(previous, d, [a, b, c])).toEqual(a)
  })

  it('skips finished stations while walking forward', () => {
    const skip = (s: NavScreen) => s.stationId === 'spells'
    expect(advancePastMissingScreen(previous, c, [a, b, d], skip)).toEqual(a)
  })

  it('returns null when nothing remains', () => {
    expect(advancePastMissingScreen(previous, b, [])).toBeNull()
  })

  it('falls back to the first eligible when missing was not in the prior list', () => {
    expect(advancePastMissingScreen([a, d], c, [a, d])).toEqual(a)
  })
})
