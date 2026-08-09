import { levelPassesFilter } from '../levels'
import {
  resolveModLookupKey,
  type ModInfo,
  type SizeBounds,
} from '../mods/loadMods'
import { splitAuthorNames } from '../mods/modFieldParse'
import {
  isComponentNode,
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
import {
  type AuthorFilterMode,
  type FilterCriteria,
  type FilterModContext,
  type FilterSeedOptions,
  type FilterSelectionContext,
  type UncheckedFilterMode,
  STABILITY_RELEASED,
  UNCHECKED_FILTER_CYCLE,
  cycleUncheckedFilter,
  uncheckedFilterLabel,
  DEFAULT_FILTER_CRITERIA,
  createDefaultFilterCriteria,
  splitTags,
  normalizeStability,
  capitalizeStabilityLabel,
  stabilityBadgeLabel,
  stabilityBadgeClass,
  filtersNeedIncludeHidden,
  isSizeFilterActive,
  isAuthorFilterActive,
  isTagsFilterActive,
  isFilterActive,
  collectFilterOptions,
} from './filterCriteria'

export {
  type AuthorFilterMode,
  type FilterCriteria,
  type FilterModContext,
  type FilterSeedOptions,
  type FilterSelectionContext,
  type UncheckedFilterMode,
  STABILITY_RELEASED,
  UNCHECKED_FILTER_CYCLE,
  cycleUncheckedFilter,
  uncheckedFilterLabel,
  DEFAULT_FILTER_CRITERIA,
  createDefaultFilterCriteria,
  splitTags,
  normalizeStability,
  capitalizeStabilityLabel,
  stabilityBadgeLabel,
  stabilityBadgeClass,
  filtersNeedIncludeHidden,
  isSizeFilterActive,
  isAuthorFilterActive,
  isTagsFilterActive,
  isFilterActive,
  collectFilterOptions,
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
  const names = splitAuthorNames(mod?.author ?? '')
  if (criteria.authorMode === 'exclude') {
    if (names.length === 0) return true
    return !names.some((name) => criteria.authors.has(name))
  }
  // include + partial selection
  return names.some((name) => criteria.authors.has(name))
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
