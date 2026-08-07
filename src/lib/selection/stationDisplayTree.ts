import { remapContentForGame } from '../xml/remapContentForGame'
import type {
  InstallSequenceModel,
  SelectedGame,
  StationBlock,
  TreeNode,
} from '../xml/schema'
import type { ModInfo } from '../mods/loadMods'
import {
  filterDisplayTree,
  filtersNeedIncludeHidden,
  type FilterCriteria,
  type FilterSeedOptions,
} from './filterDisplayTree'
import {
  buildDisplayTree,
  displayTreeHasVisible,
  stationRootsAllowDisplay,
  type DisplayNode,
} from './visibility'

export function stationChildrenForGame(
  block: StationBlock,
  game: SelectedGame,
): TreeNode[] {
  return block.stationId === 'content'
    ? remapContentForGame(block.children, game)
    : block.children
}

export function buildFilteredStationDisplayTree(
  block: StationBlock,
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
  filters: FilterCriteria,
  model: InstallSequenceModel,
  modsByCodename: ReadonlyMap<string, ModInfo>,
  filterSeed: Omit<FilterSeedOptions, 'tagOptions'> = {},
): DisplayNode[] {
  const includeHidden = filtersNeedIncludeHidden(filters)
  const stationChildren = stationChildrenForGame(block, game)
  const built = buildDisplayTree(stationChildren, { game, selectedIds, includeHidden })
  return filterDisplayTree(
    built,
    filters,
    { model, modsByCodename },
    filterSeed,
    { selectedIds, game },
  )
}

export function stationHasVisibleContent(
  block: StationBlock,
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
): boolean {
  const ctx = { game, selectedIds }
  if (!stationRootsAllowDisplay(block.roots, ctx)) return false
  return displayTreeHasVisible(stationChildrenForGame(block, game), ctx)
}
