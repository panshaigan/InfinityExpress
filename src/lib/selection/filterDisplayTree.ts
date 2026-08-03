import { levelPassesFilter } from '../levels'
import {
  isComponentNode,
  type InstallSequenceModel,
  type TreeNode,
} from '../xml/schema'
import type { DisplayNode } from './visibility'

/** Sentinel / normalized token for missing or explicit released stability. */
export const STABILITY_RELEASED = 'released'

export type TriFilterMode = 'show' | 'hide' | 'only'

export interface FilterCriteria {
  search: string
  /** Ladder max level, or null for no ladder filter. */
  maxLevel: string | null
  levelExact: boolean
  includeDifficulty: boolean
  hiddenMode: TriFilterMode
  requiredMode: TriFilterMode
  /** Empty = all; values are normalized stability tokens (incl. STABILITY_RELEASED). */
  stability: ReadonlySet<string>
  /** Empty = all; OR match across selected tags. */
  tags: ReadonlySet<string>
}

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  search: '',
  maxLevel: null,
  levelExact: false,
  includeDifficulty: false,
  hiddenMode: 'hide',
  requiredMode: 'show',
  stability: new Set(),
  tags: new Set(),
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

export function isFilterActive(criteria: FilterCriteria): boolean {
  return (
    criteria.search.trim() !== '' ||
    criteria.maxLevel !== null ||
    criteria.hiddenMode !== 'hide' ||
    criteria.requiredMode !== 'show' ||
    criteria.stability.size > 0 ||
    criteria.tags.size > 0
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

function leafMatchesCriteria(display: DisplayNode, criteria: FilterCriteria): boolean {
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

  if (criteria.stability.size > 0) {
    const stab = normalizeStability(attrs.stability)
    if (!criteria.stability.has(stab)) return false
  }

  if (criteria.tags.size > 0) {
    const nodeTags = splitTags(attrs.tags)
    if (!nodeTags.some((t) => criteria.tags.has(t))) return false
  }

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
): DisplayNode[] {
  const result: DisplayNode[] = []

  for (const display of nodes) {
    const isLeaf = display.children.length === 0 || Boolean(display.collapsedComponent)

    if (isLeaf) {
      if (leafMatchesCriteria(display, criteria)) {
        result.push({ ...display, children: [] })
      }
      continue
    }

    const filteredChildren = filterDisplayTree(display.children, criteria)
    if (filteredChildren.length > 0) {
      result.push({ ...display, children: filteredChildren })
    }
  }

  return result
}
