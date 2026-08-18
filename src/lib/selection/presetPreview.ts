import { engineMatches } from '../engine/matchEngine'
import {
  findEnclosingMod,
  resolveModLookupKey,
  type ModInfo,
} from '../mods/loadMods'
import {
  resolvePackageTileInfo,
  resolveRecommendedTileInfo,
} from '../presets/resolvePresetCopy'
import {
  passesOwnAndAncestorDisplayGates,
} from './treeAncestry'
import {
  setRecommendedSelection,
  setPackageSelection,
} from './selectionRecommended'
import type {
  ComponentNode,
  InstallSequenceModel,
  SelectedGame,
} from '../xml/schema'

export type PresetTileRef =
  | { kind: 'recommended'; token: string }
  | { kind: 'package'; token: string }

export type BlockedReason = 'displayGate' | 'alternatives'

export interface PresetPreviewGroup {
  modKey: string
  modLabel: string
  components: ComponentNode[]
}

export interface PresetTilePreview {
  tileLabel: string
  tileChecked: boolean
  wouldSelect: ComponentNode[]
  alreadySelected: ComponentNode[]
  blocked: Array<{ component: ComponentNode; reason: BlockedReason }>
  groups: {
    willTick: PresetPreviewGroup[]
    already: PresetPreviewGroup[]
    blocked: PresetPreviewGroup[]
  }
}

export interface BuildPresetTilePreviewArgs {
  model: InstallSequenceModel
  game: SelectedGame
  selectedIds: ReadonlySet<string>
  tile: PresetTileRef
  checkedRecommended: ReadonlySet<string>
  checkedPackages: ReadonlySet<string>
  modsByCodename?: ReadonlyMap<string, ModInfo>
}

function matchesRecommendedBase(c: ComponentNode, token: string): boolean {
  return c.effectiveRecommended === token && !c.effectivePackage
}

function matchesPackage(c: ComponentNode, token: string): boolean {
  return c.effectivePackage === token
}

function matchesTile(
  tile: PresetTileRef,
  c: ComponentNode,
): boolean {
  switch (tile.kind) {
    case 'recommended':
      return matchesRecommendedBase(c, tile.token)
    case 'package':
      return matchesPackage(c, tile.token)
  }
}

function isTileChecked(
  tile: PresetTileRef,
  args: Pick<
    BuildPresetTilePreviewArgs,
    'checkedRecommended' | 'checkedPackages'
  >,
): boolean {
  switch (tile.kind) {
    case 'recommended':
      return args.checkedRecommended.has(tile.token)
    case 'package':
      return args.checkedPackages.has(tile.token)
  }
}

function tileLabel(tile: PresetTileRef, model: InstallSequenceModel): string {
  switch (tile.kind) {
    case 'recommended':
      return resolveRecommendedTileInfo(tile.token).label
    case 'package':
      return resolvePackageTileInfo(tile.token, model).label
  }
}

function simulateTileOn(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  game: SelectedGame,
  tile: PresetTileRef,
): ReadonlySet<string> {
  switch (tile.kind) {
    case 'recommended':
      return setRecommendedSelection(model, selectedIds, game, tile.token, true)
    case 'package':
      return setPackageSelection(model, selectedIds, game, tile.token, true)
  }
}

function matchingPool(
  model: InstallSequenceModel,
  game: SelectedGame,
  tile: PresetTileRef,
): ComponentNode[] {
  const out: ComponentNode[] = []
  for (const c of model.componentsInOrder) {
    if (c.attrs.noDisplay) continue
    if (!engineMatches(c.effectiveEngine, game)) continue
    if (!matchesTile(tile, c)) continue
    out.push(c)
  }
  return out
}

function classifyBlockedReason(
  model: InstallSequenceModel,
  component: ComponentNode,
  after: ReadonlySet<string>,
): BlockedReason {
  if (!passesOwnAndAncestorDisplayGates(model, component, after)) {
    return 'displayGate'
  }
  return 'alternatives'
}

function modKeyFor(model: InstallSequenceModel, c: ComponentNode): string {
  const mod = findEnclosingMod(model, c)
  if (mod) return mod.key
  const codename = resolveModLookupKey(model, c)
  return codename ?? c.componentId
}

function modLabelFor(
  model: InstallSequenceModel,
  c: ComponentNode,
  modsByCodename: ReadonlyMap<string, ModInfo> | undefined,
): string {
  const mod = findEnclosingMod(model, c)
  if (mod?.attrs.label?.trim()) return mod.attrs.label.trim()
  const codename = resolveModLookupKey(model, c)
  if (codename) {
    const info = modsByCodename?.get(codename)
    if (info?.name?.trim()) return info.name.trim()
    return codename
  }
  return 'Other'
}

export function groupComponentsByMod(
  model: InstallSequenceModel,
  components: readonly ComponentNode[],
  modsByCodename?: ReadonlyMap<string, ModInfo>,
): PresetPreviewGroup[] {
  const byMod = new Map<string, PresetPreviewGroup>()
  for (const c of components) {
    const key = modKeyFor(model, c)
    let group = byMod.get(key)
    if (!group) {
      group = {
        modKey: key,
        modLabel: modLabelFor(model, c, modsByCodename),
        components: [],
      }
      byMod.set(key, group)
    }
    group.components.push(c)
  }
  return [...byMod.values()].sort((a, b) =>
    a.modLabel.localeCompare(b.modLabel, undefined, { sensitivity: 'base' }),
  )
}

/** Preview what a preset tile would select vs block from the current selection. */
export function buildPresetTilePreview(
  args: BuildPresetTilePreviewArgs,
): PresetTilePreview {
  const {
    model,
    game,
    selectedIds,
    tile,
    modsByCodename,
  } = args

  const after = simulateTileOn(model, selectedIds, game, tile)
  const pool = matchingPool(model, game, tile)

  const wouldSelect: ComponentNode[] = []
  const alreadySelected: ComponentNode[] = []
  const blocked: Array<{ component: ComponentNode; reason: BlockedReason }> = []

  for (const c of pool) {
    const id = c.componentId
    if (after.has(id)) {
      if (selectedIds.has(id)) alreadySelected.push(c)
      else wouldSelect.push(c)
    } else {
      blocked.push({
        component: c,
        reason: classifyBlockedReason(model, c, after),
      })
    }
  }

  return {
    tileLabel: tileLabel(tile, model),
    tileChecked: isTileChecked(tile, args),
    wouldSelect,
    alreadySelected,
    blocked,
    groups: {
      willTick: groupComponentsByMod(model, wouldSelect, modsByCodename),
      already: groupComponentsByMod(model, alreadySelected, modsByCodename),
      blocked: groupComponentsByMod(
        model,
        blocked.map((b) => b.component),
        modsByCodename,
      ),
    },
  }
}

export function presetTilesEqual(a: PresetTileRef | null, b: PresetTileRef | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'recommended':
      return b.kind === 'recommended' && a.token === b.token
    case 'package':
      return b.kind === 'package' && a.token === b.token
  }
}
