import type { ModInfo } from '../mods/loadMods'

/** Fields used for text search (station filters + global search). */
export interface ComponentSearchFields {
  label: string
  /** Component id; matched exactly (case-insensitive). */
  componentId?: string
  modId?: string
  desc?: string
  /** WeiDU installer title (`attrs.name`). */
  weiduName?: string
  /** Catalog mod name from mods.csv. */
  modName?: string
  /** Ancestor / path labels (containers, station, Content branches). */
  ancestorLabels?: readonly string[]
}

export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

function lower(s: string | undefined): string {
  return (s ?? '').toLowerCase()
}

/** True when any ancestor label contains `q` (already normalized). */
export function ancestorLabelsMatchSearch(
  ancestorLabels: readonly string[] | undefined,
  q: string,
): boolean {
  if (!q || !ancestorLabels?.length) return false
  return ancestorLabels.some((label) => lower(label).includes(q))
}

/**
 * Text match for a component (or leaf row).
 * - `componentId`: exact equality (case-insensitive)
 * - label, desc, modId, WeiDU name, mod catalog name: substring
 * - ancestorLabels: substring (same as station tree parent-label hits)
 */
export function componentTextMatchesSearch(
  fields: ComponentSearchFields,
  q: string,
): boolean {
  if (!q) return true

  if (fields.componentId && lower(fields.componentId) === q) return true
  if (lower(fields.label).includes(q)) return true
  if (lower(fields.modId).includes(q)) return true
  if (lower(fields.desc).includes(q)) return true
  if (lower(fields.weiduName).includes(q)) return true
  if (lower(fields.modName).includes(q)) return true
  if (ancestorLabelsMatchSearch(fields.ancestorLabels, q)) return true
  return false
}

/**
 * Relevance score for sorting (higher = better). Empty query → 0.
 * Exact id ranks highest; ancestor-only hits rank lowest.
 */
export function searchRelevanceScore(fields: ComponentSearchFields, q: string): number {
  if (!q) return 0

  if (fields.componentId && lower(fields.componentId) === q) return 1000

  const label = lower(fields.label)
  if (label === q) return 900
  if (label.startsWith(q)) return 800
  if (label.includes(q)) return 700

  if (lower(fields.weiduName).includes(q)) return 600
  if (lower(fields.modName).includes(q)) return 550
  if (lower(fields.modId).includes(q)) return 500
  if (lower(fields.desc).includes(q)) return 300

  if (ancestorLabelsMatchSearch(fields.ancestorLabels, q)) return 100
  return 0
}

/** Build search fields from common leaf attrs + optional mod catalog row. */
export function searchFieldsFromAttrs(
  attrs: {
    label?: string
    name?: string
    modId?: string
    desc?: string
  },
  options: {
    componentId?: string
    fallbackLabel?: string
    mod?: ModInfo
    ancestorLabels?: readonly string[]
  } = {},
): ComponentSearchFields {
  return {
    label: attrs.label ?? options.fallbackLabel ?? '',
    componentId: options.componentId,
    modId: attrs.modId,
    desc: attrs.desc,
    weiduName: attrs.name,
    modName: options.mod?.name,
    ancestorLabels: options.ancestorLabels,
  }
}
