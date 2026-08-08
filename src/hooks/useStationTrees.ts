import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { STATION_ORDER, type InstallSequenceModel, type SelectedGame, type StationId } from '../lib/xml/schema'
import type { ModInfo } from '../lib/mods/loadMods'
import type { FilterCriteria, FilterSeedOptions } from '../lib/selection/filterDisplayTree'
import { collectDisplayGateIds, selectionGateKey } from '../lib/selection/displayGates'
import {
  buildGlobalSearchResults,
  type GlobalSearchHit,
} from '../lib/selection/globalSearch'
import {
  buildFilteredStationDisplayTree,
  stationHasVisibleContent,
} from '../lib/selection/stationDisplayTree'
import type { DisplayNode } from '../lib/selection/visibility'
import { buildNavigableScreens, type NavScreen } from '../lib/ui/screenCycle'
import type { AppNavSlot } from '../ui/StationNav'

/** Non-content expandStationToScreens only checks `.length` — used when filters are inactive. */
const NONEMPTY_STATION_ROWS: DisplayNode[] = [
  {
    node: {
      key: '__nav-nonempty__',
      tag: 'group',
      kind: 'container',
      attrs: {},
      effectiveEngine: '',
      children: [],
    },
    children: [],
  },
]

export function useStationTrees(args: {
  model: InstallSequenceModel
  game: SelectedGame | null
  selectedIds: ReadonlySet<string>
  activeStation: AppNavSlot
  /** When 'all', build cross-station search hits. */
  searchScope: 'section' | 'all'
  filters: FilterCriteria
  /** When false, non-content cycle stops skip full filtered-tree rebuilds. */
  filtersActive: boolean
  modsByCodename: ReadonlyMap<string, ModInfo>
  filterSeed: Omit<FilterSeedOptions, 'tagOptions'>
}) {
  const {
    model,
    game,
    selectedIds,
    activeStation,
    searchScope,
    filters,
    filtersActive,
    modsByCodename,
    filterSeed,
  } = args

  const gateIds = useMemo(() => collectDisplayGateIds(model), [model])
  const gatingKey = useMemo(
    () => selectionGateKey(selectedIds, gateIds),
    [selectedIds, gateIds],
  )
  /** Unchecked filters read full selection; otherwise only gating ids reshape trees. */
  const treeSelectionKey =
    filters.uncheckedFilter !== 'off' ? selectedIds : gatingKey

  const visibleStations = useMemo(() => {
    if (!game) return [] as StationId[]
    return STATION_ORDER.filter((id) => {
      const block = model.stations.find((s) => s.stationId === id)
      if (!block) return false
      return stationHasVisibleContent(block, game, selectedIds)
    })
    // Structure only depends on displayIf gates, fingerprinted by gatingKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIds via gatingKey
  }, [game, model.stations, gatingKey])

  const contentDisplayNodes = useMemo(() => {
    if (!game) return [] as DisplayNode[]
    const block = model.stations.find((s) => s.stationId === 'content')
    if (!block) return []
    return buildFilteredStationDisplayTree(
      block,
      game,
      selectedIds,
      filters,
      model,
      modsByCodename,
      filterSeed,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIds via treeSelectionKey
  }, [filters, filterSeed, game, model, modsByCodename, treeSelectionKey])

  const displayNodes = useMemo(() => {
    if (!game || activeStation === 'engine') return []
    if (activeStation === 'content') return contentDisplayNodes
    const block = model.stations.find((s) => s.stationId === activeStation)
    if (!block) return []
    return buildFilteredStationDisplayTree(
      block,
      game,
      selectedIds,
      filters,
      model,
      modsByCodename,
      filterSeed,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIds via treeSelectionKey
  }, [
    activeStation,
    contentDisplayNodes,
    filters,
    filterSeed,
    game,
    model,
    modsByCodename,
    treeSelectionKey,
  ])

  const [globalSearchHits, setGlobalSearchHits] = useState<GlobalSearchHit[]>([])
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const globalSearchActive = Boolean(game && searchScope === 'all')

  // Mark busy before paint so All sections never flashes the empty ready state.
  useLayoutEffect(() => {
    if (!globalSearchActive) {
      setGlobalSearchHits([])
      setGlobalSearchLoading(false)
      return
    }
    setGlobalSearchLoading(true)
  }, [
    filterSeed,
    filters,
    game,
    globalSearchActive,
    model,
    modsByCodename,
    selectedIds,
  ])

  useEffect(() => {
    if (!globalSearchActive || !game) return

    let cancelled = false
    // Yield so the loading chrome can paint before the sync scan.
    const timer = window.setTimeout(() => {
      const hits = buildGlobalSearchResults(
        model,
        game,
        selectedIds,
        filters,
        { model, modsByCodename },
        filterSeed,
        { selectedIds, game },
      )
      if (!cancelled) {
        setGlobalSearchHits(hits)
        setGlobalSearchLoading(false)
      }
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    filterSeed,
    filters,
    game,
    globalSearchActive,
    model,
    modsByCodename,
    selectedIds,
  ])

  const navigableScreens = useMemo(() => {
    if (!game) return [] as NavScreen[]
    return buildNavigableScreens(visibleStations, (id) => {
      if (id === 'content') return contentDisplayNodes
      if (id === activeStation) return displayNodes
      // visibleStations already proved unfiltered visibility; without filters,
      // non-content cycle entries only need a non-empty tree.
      if (!filtersActive) {
        return NONEMPTY_STATION_ROWS
      }
      const block = model.stations.find((s) => s.stationId === id)
      if (!block) return []
      return buildFilteredStationDisplayTree(
        block,
        game,
        selectedIds,
        filters,
        model,
        modsByCodename,
        filterSeed,
      )
    })
    // When filters are active, non-content trees still need selection fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedIds via treeSelectionKey
  }, [
    activeStation,
    contentDisplayNodes,
    displayNodes,
    filters,
    filtersActive,
    filterSeed,
    game,
    model,
    modsByCodename,
    treeSelectionKey,
    visibleStations,
  ])

  return {
    visibleStations,
    displayNodes,
    globalSearchHits,
    globalSearchLoading,
    navigableScreens,
  }
}
