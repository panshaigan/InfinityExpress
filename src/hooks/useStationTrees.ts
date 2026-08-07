import { useMemo } from 'react'
import { STATION_ORDER, type InstallSequenceModel, type SelectedGame, type StationId } from '../lib/xml/schema'
import type { ModInfo } from '../lib/mods/loadMods'
import type { FilterCriteria, FilterSeedOptions } from '../lib/selection/filterDisplayTree'
import { buildGlobalSearchResults } from '../lib/selection/globalSearch'
import {
  buildFilteredStationDisplayTree,
  stationHasVisibleContent,
} from '../lib/selection/stationDisplayTree'
import { buildNavigableScreens, type NavScreen } from '../lib/ui/screenCycle'
import type { AppNavSlot } from '../ui/StationNav'

export function useStationTrees(args: {
  model: InstallSequenceModel
  game: SelectedGame | null
  selectedIds: ReadonlySet<string>
  activeStation: AppNavSlot
  filters: FilterCriteria
  modsByCodename: ReadonlyMap<string, ModInfo>
  filterSeed: Omit<FilterSeedOptions, 'tagOptions'>
}) {
  const {
    model,
    game,
    selectedIds,
    activeStation,
    filters,
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
  }, [filters, game, model, modsByCodename, filterSeed, selectedIds, visibleStations])

  return { visibleStations, displayNodes, globalSearchHits, navigableScreens }
}
