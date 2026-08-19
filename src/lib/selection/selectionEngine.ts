export type { SelectionSet } from './selectionCore'
export {
  collectDisplaySelectable,
  applyAlwaysIf,
  pruneDisplayGatedSelections,
  finalizeSelection,
  createInitialSelection,
  selectionFromInstalledIds,
  toggleNode,
  toggleDisplayNode,
  nodeSelectionState,
  displaySelectionState,
  listSelectionState,
  toggleListSelection,
} from './selectionCore'
export type { SelectionScope } from './selectionRecommended'
export {
  setRecommendedSelection,
  setPackageSelection,
  buildRecommendedBaselineSelection,
  selectionMatchesRecommendedBaseline,
} from './selectionRecommended'
export {
  buildPresetTilePreview,
  groupComponentsByMod,
  presetTilesEqual,
  type PresetTilePreview,
  type PresetTileRef,
  type PresetPreviewGroup,
} from './presetPreview'
export type { RandomizePercent, RandomizeOptions } from './selectionRandomize'
export {
  collectRandomUnits,
  randomizeDisplaySubtree,
} from './selectionRandomize'
