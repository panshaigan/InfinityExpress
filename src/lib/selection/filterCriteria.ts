import { type SizeBounds, type ModInfo } from '../mods/loadMods'
import { type InstallSequenceModel, type SelectedGame } from '../xml/schema'

/** Sentinel / normalized token for missing or explicit released stability. */
export const STABILITY_RELEASED = 'released'

export type AuthorFilterMode = 'include' | 'exclude'

/**
 * Selection display filter:
 * - `off` — no selection-based hiding
 * - `withOptions` — hide checked regular rows; keep every `<alternatives>` group
 *   (including groups that already have a choice)
 * - `only` — hide checked regular rows; keep only `<alternatives>` groups where
 *   nothing is selected yet
 * - `dependencies` — hide checked rows and always-visible rows; keep only
 *   unchecked rows gated by `displayIf` on themselves or an ancestor.
 *   Keep `<alternatives>` when the group/ancestor is gated or an unchecked
 *   option has its own `displayIf`; kept groups show the full option list.
 */
export type UncheckedFilterMode = 'off' | 'withOptions' | 'only' | 'dependencies'

export const UNCHECKED_FILTER_CYCLE: readonly UncheckedFilterMode[] = [
  'off',
  'withOptions',
  'only',
  'dependencies',
] as const

export function cycleUncheckedFilter(mode: UncheckedFilterMode): UncheckedFilterMode {
  const i = UNCHECKED_FILTER_CYCLE.indexOf(mode)
  const idx = i < 0 ? 0 : (i + 1) % UNCHECKED_FILTER_CYCLE.length
  return UNCHECKED_FILTER_CYCLE[idx]!
}

export function uncheckedFilterLabel(mode: UncheckedFilterMode): string {
  switch (mode) {
    case 'off':
      return 'Unchecked'
    case 'withOptions':
      return 'Unchecked + options'
    case 'only':
      return 'Unchecked only'
    case 'dependencies':
      return 'Unchecked dependencies'
  }
}

export interface FilterCriteria {
  search: string
  /** Ladder max level, or null for no ladder filter. */
  maxLevel: string | null
  levelExact: boolean
  includeLowerDifficulty: boolean
  includeHigherDifficulty: boolean
  /**
   * When false (default), exclude noDisplay and required components.
   * When true, show both alongside other components.
   */
  showHidden: boolean
  /** Hide checked rows; see `UncheckedFilterMode`. */
  uncheckedFilter: UncheckedFilterMode
  /** Allow-list of tag tokens (all discovered tags checked by default). */
  tags: ReadonlySet<string>
  /**
   * When false (default): untagged always pass; tagged pass if any tag is allowed.
   * When true: only components with at least one allowed tag pass (untagged fail).
   */
  tagsOnlyChecked: boolean
  /** Inclusive size range in bytes; null when catalog has no sizes. */
  sizeMinBytes: number | null
  sizeMaxBytes: number | null
  /** Selected authors for include/exclude mode. */
  authors: ReadonlySet<string>
  authorMode: AuthorFilterMode
}

export interface FilterSeedOptions {
  tagOptions?: string[]
  authorOptions?: string[]
  sizeBounds?: SizeBounds | null
}

export interface FilterModContext {
  model: InstallSequenceModel
  modsByCodename: ReadonlyMap<string, ModInfo>
}

/** Selection context for the unchecked-only display filter. */
export interface FilterSelectionContext {
  selectedIds: ReadonlySet<string>
  game: SelectedGame
}

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  search: '',
  maxLevel: null,
  levelExact: false,
  includeLowerDifficulty: true,
  includeHigherDifficulty: true,
  showHidden: false,
  uncheckedFilter: 'off',
  tags: new Set(),
  tagsOnlyChecked: false,
  sizeMinBytes: null,
  sizeMaxBytes: null,
  authors: new Set(),
  authorMode: 'include',
}

/** Build default criteria with all discovered tags/authors checked. */
export function createDefaultFilterCriteria(
  tagOptions: string[] = [],
  extras: Omit<FilterSeedOptions, 'tagOptions'> = {},
): FilterCriteria {
  const bounds = extras.sizeBounds ?? null
  const authorOptions = extras.authorOptions ?? []
  return {
    ...DEFAULT_FILTER_CRITERIA,
    tags: new Set(tagOptions),
    tagsOnlyChecked: false,
    sizeMinBytes: bounds?.min ?? null,
    sizeMaxBytes: bounds?.max ?? null,
    authors: new Set(authorOptions),
    authorMode: 'include',
  }
}

export function splitTags(tags: string | undefined): string[] {
  if (!tags?.trim()) return []
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function normalizeStability(stability: string | undefined): string {
  const s = stability?.trim()
  if (!s || s === STABILITY_RELEASED) return STABILITY_RELEASED
  return s
}

/** Capitalize first letter for display (beta → Beta). */
export function capitalizeStabilityLabel(token: string): string {
  if (!token) return token
  return token.charAt(0).toUpperCase() + token.slice(1)
}

/** Non-released stability for badges; null when released/missing. */
export function stabilityBadgeLabel(stability: string | undefined): string | null {
  const n = normalizeStability(stability)
  if (n === STABILITY_RELEASED) return null
  return capitalizeStabilityLabel(n)
}

/**
 * CSS classes for a non-released stability badge; null when released/missing.
 * Known tokens: alpha, beta; anything else uses `other`.
 */
export function stabilityBadgeClass(stability: string | undefined): string | null {
  const n = normalizeStability(stability)
  if (n === STABILITY_RELEASED) return null
  const key = n === 'alpha' || n === 'beta' ? n : 'other'
  return `badge badge-stability badge-stability-${key}`
}

export function filtersNeedIncludeHidden(criteria: FilterCriteria): boolean {
  return criteria.showHidden
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) {
    if (!b.has(v)) return false
  }
  return true
}

export function isSizeFilterActive(
  criteria: FilterCriteria,
  sizeBounds: SizeBounds | null | undefined,
): boolean {
  if (!sizeBounds) return false
  if (criteria.sizeMinBytes == null || criteria.sizeMaxBytes == null) return false
  return (
    criteria.sizeMinBytes !== sizeBounds.min ||
    criteria.sizeMaxBytes !== sizeBounds.max
  )
}

export function isAuthorFilterActive(
  criteria: FilterCriteria,
  authorOptions: readonly string[],
): boolean {
  if (criteria.authorMode === 'exclude') {
    return criteria.authors.size > 0
  }
  const all = new Set(authorOptions)
  return !setsEqual(criteria.authors, all)
}

export function isTagsFilterActive(
  criteria: FilterCriteria,
  tagOptions: readonly string[],
): boolean {
  if (criteria.tagsOnlyChecked) return true
  return !setsEqual(criteria.tags, new Set(tagOptions))
}

/** True when criteria differ from the seeded defaults for the given options. */
export function isFilterActive(
  criteria: FilterCriteria,
  tagOptions: string[],
  extras: Omit<FilterSeedOptions, 'tagOptions'> = {},
): boolean {
  const defaults = createDefaultFilterCriteria(tagOptions, extras)
  return (
    criteria.search.trim() !== '' ||
    criteria.maxLevel !== null ||
    criteria.levelExact !== defaults.levelExact ||
    criteria.includeLowerDifficulty !== defaults.includeLowerDifficulty ||
    criteria.includeHigherDifficulty !== defaults.includeHigherDifficulty ||
    criteria.showHidden !== defaults.showHidden ||
    criteria.uncheckedFilter !== defaults.uncheckedFilter ||
    criteria.tagsOnlyChecked !== defaults.tagsOnlyChecked ||
    !setsEqual(criteria.tags, defaults.tags) ||
    isSizeFilterActive(criteria, extras.sizeBounds ?? null) ||
    isAuthorFilterActive(criteria, extras.authorOptions ?? [])
  )
}

export function collectFilterOptions(model: InstallSequenceModel): {
  tags: string[]
} {
  const tags = new Set<string>()
  for (const c of model.componentsInOrder) {
    for (const t of splitTags(c.attrs.tags)) tags.add(t)
  }
  return {
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
  }
}

