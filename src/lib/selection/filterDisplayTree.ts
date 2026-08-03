import { levelPassesFilter } from '../levels'
import {
  resolveModLookupKey,
  type ModInfo,
  type SizeBounds,
} from '../mods/loadMods'
import {
  isComponentNode,
  type InstallSequenceModel,
  type TreeNode,
} from '../xml/schema'
import type { DisplayNode } from './visibility'

/** Sentinel / normalized token for missing or explicit released stability. */
export const STABILITY_RELEASED = 'released'

export type TriFilterMode = 'show' | 'hide' | 'only'
export type AuthorFilterMode = 'include' | 'exclude'

export interface FilterCriteria {
  search: string
  /** Ladder max level, or null for no ladder filter. */
  maxLevel: string | null
  levelExact: boolean
  includeDifficulty: boolean
  hiddenMode: TriFilterMode
  requiredMode: TriFilterMode
  /** Allow-list of stability tokens (incl. STABILITY_RELEASED). */
  stability: ReadonlySet<string>
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

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  search: '',
  maxLevel: null,
  levelExact: false,
  includeDifficulty: true,
  hiddenMode: 'hide',
  requiredMode: 'hide',
  stability: new Set([STABILITY_RELEASED]),
  tags: new Set(),
  tagsOnlyChecked: false,
  sizeMinBytes: null,
  sizeMaxBytes: null,
  authors: new Set(),
  authorMode: 'include',
}

/** Build default criteria with all discovered tags/authors checked and Released-only stability. */
export function createDefaultFilterCriteria(
  tagOptions: string[] = [],
  extras: Omit<FilterSeedOptions, 'tagOptions'> = {},
): FilterCriteria {
  const bounds = extras.sizeBounds ?? null
  const authorOptions = extras.authorOptions ?? []
  return {
    ...DEFAULT_FILTER_CRITERIA,
    stability: new Set([STABILITY_RELEASED]),
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

/** Non-released stability for badges; null when released/missing. */
export function stabilityBadgeLabel(stability: string | undefined): string | null {
  const n = normalizeStability(stability)
  if (n === STABILITY_RELEASED) return null
  return n
}

export function filtersNeedIncludeHidden(criteria: FilterCriteria): boolean {
  return criteria.hiddenMode !== 'hide'
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
    criteria.includeDifficulty !== defaults.includeDifficulty ||
    criteria.hiddenMode !== defaults.hiddenMode ||
    criteria.requiredMode !== defaults.requiredMode ||
    criteria.tagsOnlyChecked !== defaults.tagsOnlyChecked ||
    !setsEqual(criteria.stability, defaults.stability) ||
    !setsEqual(criteria.tags, defaults.tags) ||
    isSizeFilterActive(criteria, extras.sizeBounds ?? null) ||
    isAuthorFilterActive(criteria, extras.authorOptions ?? [])
  )
}

export function collectFilterOptions(model: InstallSequenceModel): {
  tags: string[]
  stabilities: string[]
} {
  const tags = new Set<string>()
  const stabilities = new Set<string>()
  for (const c of model.componentsInOrder) {
    for (const t of splitTags(c.attrs.tags)) tags.add(t)
    const n = normalizeStability(c.attrs.stability)
    if (n !== STABILITY_RELEASED) stabilities.add(n)
  }
  return {
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    stabilities: [...stabilities].sort((a, b) => a.localeCompare(b)),
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

function leafMatchesCriteria(
  display: DisplayNode,
  criteria: FilterCriteria,
  ctx: FilterModContext | undefined,
  seed: Omit<FilterSeedOptions, 'tagOptions'>,
): boolean {
  const source = displaySource(display)
  const attrs = source.attrs
  const level =
    display.collapsedComponent?.effectiveLevel ?? display.node.effectiveLevel

  if (
    !levelPassesFilter(
      level,
      criteria.maxLevel,
      criteria.levelExact,
      criteria.includeDifficulty,
    )
  ) {
    return false
  }

  const isHidden = Boolean(attrs.noDisplay)
  if (criteria.hiddenMode === 'only' && !isHidden) return false
  if (criteria.hiddenMode === 'hide' && isHidden) return false

  const isRequired = Boolean(attrs.required)
  if (criteria.requiredMode === 'only' && !isRequired) return false
  if (criteria.requiredMode === 'hide' && isRequired) return false

  const stab = normalizeStability(attrs.stability)
  if (!criteria.stability.has(stab)) return false

  if (!tagsPass(splitTags(attrs.tags), criteria.tags, criteria.tagsOnlyChecked)) {
    return false
  }

  const mod = resolveMod(display, ctx)
  if (!sizePasses(mod, criteria, seed.sizeBounds ?? null)) return false
  if (!authorPasses(mod, criteria, seed.authorOptions ?? [])) return false

  const q = criteria.search.trim().toLowerCase()
  if (q) {
    const label = (
      attrs.label ??
      display.node.attrs.label ??
      display.node.tag
    ).toLowerCase()
    const id = isComponentNode(source) ? source.componentId.toLowerCase() : ''
    const modId = (attrs.modId ?? '').toLowerCase()
    const desc = (attrs.desc ?? display.node.attrs.desc ?? '').toLowerCase()
    if (
      !label.includes(q) &&
      !id.includes(q) &&
      !modId.includes(q) &&
      !desc.includes(q)
    ) {
      return false
    }
  }

  return true
}

/**
 * Prune display tree by filter criteria. Keep ancestors when any descendant matches.
 * Leaf / collapsed rows must match; containers stay only as scaffolding for matches.
 */
export function filterDisplayTree(
  nodes: DisplayNode[],
  criteria: FilterCriteria,
  ctx?: FilterModContext,
  seed: Omit<FilterSeedOptions, 'tagOptions'> = {},
): DisplayNode[] {
  const result: DisplayNode[] = []

  for (const display of nodes) {
    const isLeaf = display.children.length === 0 || Boolean(display.collapsedComponent)

    if (isLeaf) {
      if (leafMatchesCriteria(display, criteria, ctx, seed)) {
        result.push({ ...display, children: [] })
      }
      continue
    }

    const filteredChildren = filterDisplayTree(display.children, criteria, ctx, seed)
    if (filteredChildren.length > 0) {
      result.push({ ...display, children: filteredChildren })
    }
  }

  return result
}
