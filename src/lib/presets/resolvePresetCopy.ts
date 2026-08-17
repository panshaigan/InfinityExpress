import {
  PRESET_PACKAGE_COPY,
  PRESET_TILE_COPY,
  type PresetTileCopy,
} from '../../data/presetCatalog'
import { packageLabel, recommendedLabel } from '../recommended/labels'
import type { InstallSequenceModel } from '../xml/schema'

export interface ResolvedPresetTileInfo {
  label: string
  summary: string
  typeAndDepth: string
  recommendedFor: string
}

function mergeCopy(copy: PresetTileCopy | undefined): Omit<ResolvedPresetTileInfo, 'label'> {
  return {
    summary: copy?.summary?.trim() ?? '',
    typeAndDepth: copy?.typeAndDepth?.trim() ?? '',
    recommendedFor: copy?.recommendedFor?.trim() ?? '',
  }
}

/** Label + tooltip copy for a recommended preset tile. */
export function resolveRecommendedTileInfo(token: string): ResolvedPresetTileInfo {
  const copy = PRESET_TILE_COPY[token]
  const label = copy?.label?.trim() || recommendedLabel(token)
  return { label, ...mergeCopy(copy) }
}

/** Label + tooltip copy for a package preset tile. */
export function resolvePackageTileInfo(
  token: string,
  model: InstallSequenceModel,
): ResolvedPresetTileInfo {
  const copy = PRESET_PACKAGE_COPY[token]
  const label = copy?.label?.trim() || packageLabel(model, token)
  return { label, ...mergeCopy(copy) }
}

/** Display label only (recommended or package). */
export function resolvePresetTileLabel(
  token: string,
  model: InstallSequenceModel,
  kind: 'recommended' | 'package',
): string {
  if (kind === 'package') return resolvePackageTileInfo(token, model).label
  return resolveRecommendedTileInfo(token).label
}
