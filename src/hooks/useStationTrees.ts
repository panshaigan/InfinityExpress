import { useMemo } from 'react'
import { STATION_ORDER, type InstallSequenceModel, type SelectedGame, type StationId } from '../lib/xml/schema'
import type { ModInfo } from '../lib/mods/loadMods'
import type { FilterCriteria, FilterSeedOptions } from '../lib/selection/filterDisplayTree'
import { buildGlobalSearchResults } from '../lib/selection/globalSearch'
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
    filters,
    filtersActive,
    modsByCodename,
    filterSeed,
  } = args

  const visibleStations = useMemo(() => {
    if (!game) return [] as StationId[]
    return STATION_ORDER.filter((id) => {
      const block = model.stations.find((s) => s.stationId === id)
      if (!block) return false
      return stationHasVisibleContent(block, game, selectedIds)
    })
  }, [game, model.stations, selectedIds])

  const displayNodes = useMemo(() => {
    if (!game || activeStation === 'engine' || activeStation === 'search') return []
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
  }, [activeStation, filters, game, model, modsByCodename, filterSeed, selectedIds])

  const globalSearchHits = useMemo(() => {
    if (!game || activeStation !== 'search') return []
    return buildGlobalSearchResults(
      model,
      game,
      selectedIds,
      filters,
      { model, modsByCodename },
      filterSeed,
      { selectedIds, game },
    )
  }, [activeStation, filters, game, model, modsByCodename, filterSeed, selectedIds])

  const navigableScreens = useMemo(() => {
    if (!game) return [] as NavScreen[]
    return buildNavigableScreens(visibleStations, (id) => {
      if (
        id === activeStation &&
        activeStation !== 'engine' &&
        activeStation !== 'search'
      ) {
        return displayNodes
      }
      // visibleStations already proved unfiltered visibility; without filters,
      // non-content cycle entries only need a non-empty tree.
      if (id !== 'content' && !filtersActive) {
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
  }, [
    activeStation,
    displayNodes,
    filters,
    filtersActive,
    game,
    model,
    modsByCodename,
    filterSeed,
    selectedIds,
    visibleStations,
  ])

  return { visibleStations, displayNodes, globalSearchHits, navigableScreens }
}
