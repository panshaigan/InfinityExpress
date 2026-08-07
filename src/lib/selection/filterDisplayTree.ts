import { levelPassesFilter } from '../levels'
import {
  resolveModLookupKey,
  type ModInfo,
  type SizeBounds,
} from '../mods/loadMods'
import {
  isComponentNode,
  type InstallSequenceModel,
  type SelectedGame,
  type TreeNode,
} from '../xml/schema'
import {
  ancestorLabelsMatchSearch,
  componentTextMatchesSearch,
  normalizeSearchQuery,
  searchFieldsFromAttrs,
} from './componentSearch'
import { displaySelectionState } from './selectionEngine'
import type { DisplayNode } from './visibility'

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

function displaySource(display: DisplayNode): TreeNode {
  return display.collapsedComponent ?? display.node
}

function tagsPass(
  nodeTags: string[],
  allowed: ReadonlySet<string>,
  onlyChecked: boolean,
): boolean {
  if (nodeTags.length === 0) return !onlyChecked
  return nodeTags.some((t) => allowed.has(t))
}

function resolveMod(
  display: DisplayNode,
  ctx: FilterModContext | undefined,
): ModInfo | undefined {
  if (!ctx) return undefined
  const source = displaySource(display)
  const key = resolveModLookupKey(ctx.model, source)
  if (!key) return undefined
  return ctx.modsByCodename.get(key)
}

function sizePasses(
  mod: ModInfo | undefined,
  criteria: FilterCriteria,
  sizeBounds: SizeBounds | null | undefined,
): boolean {
  if (!isSizeFilterActive(criteria, sizeBounds)) return true
  if (mod?.sizeBytes == null) return false
  const min = criteria.sizeMinBytes!
  const max = criteria.sizeMaxBytes!
  return mod.sizeBytes >= min && mod.sizeBytes <= max
}

function authorPasses(
  mod: ModInfo | undefined,
  criteria: FilterCriteria,
  authorOptions: readonly string[],
): boolean {
  if (!isAuthorFilterActive(criteria, authorOptions)) return true
  const author = mod?.author ?? ''
  if (criteria.authorMode === 'exclude') {
    return !author || !criteria.authors.has(author)
  }
  // include + partial selection
  return Boolean(author) && criteria.authors.has(author)
}

/** Display label used for search (attrs.label, else tag name). */
function displaySearchLabel(display: DisplayNode): string {
  return (display.node.attrs.label ?? display.node.tag).toLowerCase()
}

function leafSearchFields(
  display: DisplayNode,
  mod: ModInfo | undefined,
): ReturnType<typeof searchFieldsFromAttrs> {
  const source = displaySource(display)
  const attrs = source.attrs
  return searchFieldsFromAttrs(
    {
      label: attrs.label ?? display.node.attrs.label,
      name: attrs.name ?? display.node.attrs.name,
      modId: attrs.modId,
      desc: attrs.desc ?? display.node.attrs.desc,
    },
    {
      componentId: isComponentNode(source) ? source.componentId : undefined,
      fallbackLabel: display.node.tag,
      mod,
    },
  )
}

export interface LeafFilterOptions {
  /** When true, ignore `criteria.showHidden` and always include hidden/required. */
  forceShowHidden?: boolean
  /** Ancestor container label already matched the search query. */
  searchHitFromAncestor?: boolean
  /** Explicit ancestor labels for search (global path); optional with flag above. */
  ancestorLabels?: readonly string[]
}

/**
 * Whether a leaf display row passes filter criteria (level, hidden, tags, size,
 * author, search). Shared by station tree filtering and global search.
 */
export function leafMatchesCriteria(
  display: DisplayNode,
  criteria: FilterCriteria,
  ctx: FilterModContext | undefined,
  seed: Omit<FilterSeedOptions, 'tagOptions'> = {},
  options: LeafFilterOptions = {},
): boolean {
  const source = displaySource(display)
  const attrs = source.attrs
  const level =
    display.collapsedComponent?.effectiveLevel ?? display.node.effectiveLevel

  if (
    !levelPassesFilter(level, criteria.maxLevel, criteria.levelExact, {
      includeLowerDifficulty: criteria.includeLowerDifficulty,
      includeHigherDifficulty: criteria.includeHigherDifficulty,
    })
  ) {
    return false
  }

  const showHidden = options.forceShowHidden || criteria.showHidden
  const isHidden = Boolean(attrs.noDisplay)
  const isRequired = Boolean(attrs.required)
  if (!showHidden && (isHidden || isRequired)) return false

  if (!tagsPass(splitTags(attrs.tags), criteria.tags, criteria.tagsOnlyChecked)) {
    return false
  }

  const mod = resolveMod(display, ctx)
  if (!sizePasses(mod, criteria, seed.sizeBounds ?? null)) return false
  if (!authorPasses(mod, criteria, seed.authorOptions ?? [])) return false

  const q = normalizeSearchQuery(criteria.search)
  if (q) {
    const hitAncestor =
      Boolean(options.searchHitFromAncestor) ||
      ancestorLabelsMatchSearch(options.ancestorLabels, q)
    if (!hitAncestor) {
      const fields = leafSearchFields(display, mod)
      if (!componentTextMatchesSearch(fields, q)) return false
    }
  }

  return true
}

/** True when an alternatives option has displayIf and is not checked. */
function alternativesHasUncheckedDisplayIfOption(
  display: DisplayNode,
  selection: FilterSelectionContext,
): boolean {
  for (const child of display.children) {
    if (!child.node.attrs.displayIf?.trim()) continue
    if (
      displaySelectionState(child, selection.selectedIds, selection.game) !==
      'checked'
    ) {
      return true
    }
  }
  return false
}

/**
 * Prune display tree by filter criteria. Keep ancestors when any descendant matches.
 * Leaf / collapsed rows must match; containers stay only as scaffolding for matches.
 * Search matches leaf label / exact component id / modId / desc / WeiDU name /
 * catalog mod name, or any ancestor container label.
 *
 * Unchecked filter modes:
 * - `withOptions` — drop checked regular rows; keep all `<alternatives>` groups
 *   (full option lists, even when a choice is already selected)
 * - `only` — drop checked regular rows; keep `<alternatives>` only when nothing
 *   in the group is selected yet (full option list when kept)
 * - `dependencies` — drop checked and always-visible rows; keep unchecked rows
 *   gated by `displayIf` on themselves or an ancestor. Keep `<alternatives>`
 *   when the group/ancestor is gated or an unchecked option has its own
 *   `displayIf`; kept groups show the full option list
 */
export function filterDisplayTree(
  nodes: DisplayNode[],
  criteria: FilterCriteria,
  ctx?: FilterModContext,
  seed: Omit<FilterSeedOptions, 'tagOptions'> = {},
  selection?: FilterSelectionContext,
  options: {
    skipSelectionFilter?: boolean
    underDisplayIf?: boolean
    /** Ancestor container label already matched the search query. */
    searchHitFromAncestor?: boolean
  } = {},
): DisplayNode[] {
  const result: DisplayNode[] = []
  const mode = criteria.uncheckedFilter
  const applySelection =
    mode !== 'off' && !options.skipSelectionFilter && selection != null
  const underDisplayIf = Boolean(options.underDisplayIf)
  const q = normalizeSearchQuery(criteria.search)

  for (const display of nodes) {
    const gatedHere =
      underDisplayIf || Boolean(display.node.attrs.displayIf?.trim())
    const searchHitFromAncestor =
      Boolean(options.searchHitFromAncestor) ||
      (q !== '' && displaySearchLabel(display).includes(q))

    if (applySelection && display.node.kind === 'alternatives') {
      if (
        mode === 'dependencies' &&
        !gatedHere &&
        !alternativesHasUncheckedDisplayIfOption(display, selection)
      ) {
        continue
      }
      if (
        mode === 'only' &&
        displaySelectionState(display, selection.selectedIds, selection.game) !==
          'unchecked'
      ) {
        continue
      }
      const filteredChildren = filterDisplayTree(
        display.children,
        criteria,
        ctx,
        seed,
        selection,
        {
          skipSelectionFilter: true,
          underDisplayIf: gatedHere,
          searchHitFromAncestor,
        },
      )
      if (filteredChildren.length > 0) {
        result.push({ ...display, children: filteredChildren })
      }
      continue
    }

    const isLeaf = display.children.length === 0 || Boolean(display.collapsedComponent)

    if (isLeaf) {
      if (
        !leafMatchesCriteria(display, criteria, ctx, seed, {
          searchHitFromAncestor: Boolean(options.searchHitFromAncestor),
        })
      ) {
        continue
      }
      if (
        applySelection &&
        displaySelectionState(display, selection.selectedIds, selection.game) ===
          'checked'
      ) {
        continue
      }
      if (applySelection && mode === 'dependencies' && !gatedHere) {
        continue
      }
      result.push({ ...display, children: [] })
      continue
    }

    const filteredChildren = filterDisplayTree(
      display.children,
      criteria,
      ctx,
      seed,
      selection,
      {
        ...options,
        underDisplayIf: gatedHere,
        searchHitFromAncestor,
      },
    )
    if (filteredChildren.length > 0) {
      result.push({ ...display, children: filteredChildren })
    }
  }

  return result
}
