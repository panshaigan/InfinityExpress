// @vitest-environment jsdom
import { act, createElement, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DisplayNode } from '../lib/selection/visibility'
import { buildNavigableScreens } from '../lib/ui/screenCycle'
import type { StationId } from '../lib/xml/schema'
import type { AppNavSlot } from '../ui/StationNav'
import { useBranchNav } from './useBranchNav'
import { useRouteNav } from './useRouteNav'

function branch(key: string, tag: string, children: DisplayNode[] = []): DisplayNode {
  return {
    node: { key, tag, kind: 'container', attrs: {}, effectiveEngine: '', children: [] },
    children,
  }
}

const row = branch('row', 'mod')
const npc = branch('bg1-npc', 'npc', [row])
const items = branch('bg1-items', 'items', [row])
const visibleStations: StationId[] = ['base', 'content', 'mechanics', 'spells']
type StationTrees = Partial<Record<StationId, DisplayNode[]>>
const initialTrees: StationTrees = {
  base: [row],
  content: [branch('bg1', 'bg1', [npc, items])],
  mechanics: [branch('warriors', 'warriors', [row])],
  spells: [row],
}
const clearFocus = vi.fn()

describe('station navigation with branch selectors', () => {
  let root: Root
  let current: {
    activeStation: AppNavSlot
    selectStation: (station: AppNavSlot) => void
    setTrees: (trees: StationTrees) => void
    branchNav: ReturnType<typeof useBranchNav>
    route: ReturnType<typeof useRouteNav>
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    root = createRoot(document.createElement('div'))
    function Navigation() {
      const [activeStation, setActiveStation] = useState<AppNavSlot>('presets')
      const [trees, setTrees] = useState(initialTrees)
      const branchNav = useBranchNav({
        activeStation,
        displayNodes: activeStation === 'presets' || activeStation === 'engine'
          ? [] : trees[activeStation] ?? [],
        onClearFocus: clearFocus,
      })
      const navigableScreens = useMemo(
        () => buildNavigableScreens(visibleStations, (id) => trees[id] ?? []),
        [trees],
      )
      const route = useRouteNav({
        game: 'bg1',
        activeStation,
        setActiveStation,
        visibleStations,
        navigableScreens,
        contentMainKey: branchNav.mainKey,
        contentSubKey: branchNav.subKey,
        contentSubTag: branchNav.subTag,
        setContentMainKey: branchNav.setMainKey,
        setContentSubKey: branchNav.setSubKey,
        setContentSubTag: branchNav.setSubTag,
        clearFocus,
        showRouteTip: false,
        dismissRouteTip: clearFocus,
      })
      current = { activeStation, selectStation: setActiveStation, setTrees, branchNav, route }
      return null
    }
    act(() => root.render(createElement(Navigation)))
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  it('initializes selectors and stays on the clicked Content or Mechanics station', () => {
    act(() => current.selectStation('content'))
    expect(current.activeStation).toBe('content')
    expect(current.branchNav.selectedSub?.node.key).toBe('bg1-npc')

    act(() => current.selectStation('mechanics'))
    expect(current.activeStation).toBe('mechanics')
    expect(current.branchNav.selectedMain?.node.key).toBe('warriors')

    act(() => current.selectStation('content'))
    expect(current.activeStation).toBe('content')
    expect(current.branchNav.selectedSub?.node.key).toBe('bg1-npc')
  })

  it('repairs the Type selection when returning through a flat station after filtering', () => {
    act(() => current.selectStation('content'))
    act(() => current.selectStation('base'))
    act(() => current.setTrees({
      ...initialTrees,
      content: [branch('bg1', 'bg1', [items])],
    }))

    act(() => current.selectStation('content'))
    expect(current.activeStation).toBe('content')
    expect(current.branchNav.selectedSub?.node.key).toBe('bg1-items')
  })

  it('keeps a manually selected station open even when filters leave it empty', () => {
    act(() => current.setTrees({ ...initialTrees, spells: [] }))
    act(() => current.selectStation('spells'))
    expect(current.activeStation).toBe('spells')
  })

  it('still advances when filtering removes the current Type', () => {
    act(() => current.selectStation('content'))
    act(() => current.setTrees({
      ...initialTrees,
      content: [branch('bg1', 'bg1', [items])],
    }))
    expect(current.activeStation).toBe('content')
    expect(current.branchNav.selectedSub?.node.key).toBe('bg1-items')
  })

  it('still skips finished stations when the current station becomes empty', () => {
    act(() => current.selectStation('content'))
    act(() => current.route.markStationFinished('mechanics'))
    act(() => current.setTrees({ ...initialTrees, content: [] }))
    expect(current.activeStation).toBe('spells')
  })

  it('preserves Previous, Next, and Done navigation through branch screens', () => {
    act(() => current.selectStation('content'))
    act(() => current.route.goNextScreen())
    expect(current.branchNav.selectedSub?.node.key).toBe('bg1-items')
    act(() => current.route.goPrevScreen())
    expect(current.branchNav.selectedSub?.node.key).toBe('bg1-npc')
    act(() => current.route.onOk())
    expect(current.route.finishedStations.has('content')).toBe(true)
    expect(current.activeStation).toBe('mechanics')
  })
})
