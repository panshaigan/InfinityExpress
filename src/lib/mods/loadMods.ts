import type { InstallSequenceModel, TreeNode } from '../xml/schema'
import { splitAuthorNames } from './modFieldParse'

export interface ModInfo {
  codename: string
  name: string
  abbreviation: string
  category: string
  url: string
  readme: string
  game: string
  /** Track default-branch tip (SHA) instead of releases — Artisan-style. */
  useMaster: boolean
  /** Prefer GitHub release archive assets (or zip URL in release body). */
  useAssets: boolean
  release: string
  version: string
  sizeBytes: number | null
  author: string
  type: string
  stability: string
}

export type ModOrigin = 'base' | 'user'

export type DiskStatus =
  | 'not_present'
  | 'present'
  | 'update_available'
  | 'busy'

/** Local overrides applied on top of base/user catalog fields after acquire/update. */
export interface ModFieldOverlays {
  version?: string
  release?: string
  sizeBytes?: number | null
}

export interface WorkingMod extends ModInfo {
  origin: ModOrigin
  diskStatus: DiskStatus
  overlays: ModFieldOverlays
}

export interface SizeBounds {
  min: number
  max: number
}

export interface AuthorOption {
  name: string
  count: number
}

/** Parse a single CSV line, respecting double-quoted fields and "" escapes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function parseSizeBytes(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

/** Truthy CSV flags: non-empty UseMaster; UseAssets only `1` / `true`. */
export function parseCsvFlag(raw: string | undefined, mode: 'any' | 'strict'): boolean {
  const s = (raw ?? '').trim()
  if (!s) return false
  if (mode === 'any') return true
  return s === '1' || s.toLowerCase() === 'true'
}

/**
 * Parse mods.csv into a Map keyed by Codename.
 * Duplicate Codenames keep the first row.
 */
export function parseModsCsv(raw: string): Map<string, ModInfo> {
  const map = new Map<string, ModInfo>()
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return map

  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)
  const iCodename = idx('Codename')
  const iName = idx('Name')
  const iAbbreviation = idx('Abbreviation')
  const iCategory = idx('Category')
  const iUrl = idx('URL')
  const iReadme = idx('Readme')
  const iGame = idx('Game')
  const iUseMaster = idx('UseMaster')
  const iUseAssets = idx('UseAssets')
  const iRelease = idx('Release')
  const iVersion = idx('Version')
  const iSize = idx('Size')
  const iAuthor = idx('Author')
  const iType = idx('Type')
  const iStability = idx('Stability')
  if (iCodename < 0) return map

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const codename = (cols[iCodename] ?? '').trim()
    if (!codename || map.has(codename)) continue
    map.set(codename, {
      codename,
      name: (iName >= 0 ? cols[iName] ?? '' : '').trim(),
      abbreviation: (iAbbreviation >= 0 ? cols[iAbbreviation] ?? '' : '').trim(),
      category: (iCategory >= 0 ? cols[iCategory] ?? '' : '').trim(),
      url: (iUrl >= 0 ? cols[iUrl] ?? '' : '').trim(),
      readme: (iReadme >= 0 ? cols[iReadme] ?? '' : '').trim(),
      game: (iGame >= 0 ? cols[iGame] ?? '' : '').trim(),
      useMaster:
        iUseMaster >= 0 ? parseCsvFlag(cols[iUseMaster], 'any') : false,
      useAssets:
        iUseAssets >= 0 ? parseCsvFlag(cols[iUseAssets], 'strict') : false,
      release: (iRelease >= 0 ? cols[iRelease] ?? '' : '').trim(),
      version: (iVersion >= 0 ? cols[iVersion] ?? '' : '').trim(),
      sizeBytes: iSize >= 0 ? parseSizeBytes(cols[iSize] ?? '') : null,
      author: (iAuthor >= 0 ? cols[iAuthor] ?? '' : '').trim(),
      type: (iType >= 0 ? cols[iType] ?? '' : '').trim(),
      stability: (iStability >= 0 ? cols[iStability] ?? '' : '').trim(),
    })
  }
  return map
}

/** Apply overlays onto catalog fields for display / acquire state. */
export function effectiveModFields(mod: WorkingMod): ModInfo {
  return {
    codename: mod.codename,
    name: mod.name,
    abbreviation: mod.abbreviation,
    category: mod.category,
    url: mod.url,
    readme: mod.readme,
    game: mod.game,
    useMaster: mod.useMaster,
    useAssets: mod.useAssets,
    release: mod.overlays.release ?? mod.release,
    version: mod.overlays.version ?? mod.version,
    sizeBytes:
      mod.overlays.sizeBytes !== undefined
        ? mod.overlays.sizeBytes
        : mod.sizeBytes,
    author: mod.author,
    type: mod.type,
    stability: mod.stability,
  }
}

/**
 * Distinct mod codenames represented by the selected components.
 * Uses resolveModLookupKey; orphans with no key fall back to componentId.
 */
export function listSelectedModCodenames(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
): string[] {
  const keys = new Set<string>()
  for (const id of selectedIds) {
    const node = model.componentsById.get(id)
    if (!node) continue
    keys.add(resolveModLookupKey(model, node) ?? node.componentId)
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

/** Format byte count as human-readable (1024-based). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B'
  if (n < 1024) return `${Math.round(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let value = n / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${rounded.replace(/\.0$/, '')} ${units[unitIndex]}`
}

/** Min/max Size over known entries; null when none. */
export function modSizeBounds(map: Map<string, ModInfo>): SizeBounds | null {
  let min = Infinity
  let max = -Infinity
  for (const mod of map.values()) {
    if (mod.sizeBytes == null) continue
    if (mod.sizeBytes < min) min = mod.sizeBytes
    if (mod.sizeBytes > max) max = mod.sizeBytes
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max }
}

/**
 * Authors with at least `minMods` mods (default 3 = more than two).
 * Co-author cells are split on commas so each person counts separately.
 * Sorted by count descending, then name.
 */
export function collectAuthorOptions(
  map: Map<string, ModInfo>,
  minMods = 3,
): AuthorOption[] {
  const counts = new Map<string, number>()
  for (const mod of map.values()) {
    if (!mod.author) continue
    for (const name of splitAuthorNames(mod.author)) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minMods)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function parentOf(model: InstallSequenceModel, node: TreeNode): TreeNode | undefined {
  return node.parentKey ? model.nodesByKey.get(node.parentKey) : undefined
}

/** True when a mods.csv field has a displayable value. */
export function hasModField(value: string | undefined): value is string {
  return !!value && value !== '-'
}

/** Walk ancestors for the nearest enclosing `<mod>` node. */
export function findEnclosingMod(
  model: InstallSequenceModel,
  node: TreeNode,
): TreeNode | undefined {
  let cur: TreeNode | undefined = node
  while (cur) {
    if (cur.tag === 'mod') return cur
    cur = parentOf(model, cur)
  }
  return undefined
}

/**
 * Whether a tree row should show a mods.csv Type badge:
 * always for `<mod>`, for `<component>` only when not nested under a `<mod>`,
 * and for any row collapsed to a single component (branch stands in for that leaf).
 */
export function shouldShowModTypeBadge(
  model: InstallSequenceModel,
  node: TreeNode,
  options?: { collapsedToSingleComponent?: boolean },
): boolean {
  return isModTypeBranchDisplay(model, node, options)
}

/**
 * True when the row stands in for a whole mod / branch (no type degradation):
 * `<mod>` rows, standalone components (not under `<mod>`), or single-child collapse.
 */
export function isModTypeBranchDisplay(
  model: InstallSequenceModel,
  node: TreeNode,
  options?: { collapsedToSingleComponent?: boolean },
): boolean {
  if (options?.collapsedToSingleComponent) return true
  if (node.tag === 'mod') return true
  if (node.tag === 'component') return findEnclosingMod(model, node) === undefined
  return false
}

/**
 * Resolve the mods.csv Codename lookup key for a tree node:
 * 1. node's attrs.modId
 * 2. else enclosing <mod> attrs.id ?? attrs.modId
 */
export function resolveModLookupKey(
  model: InstallSequenceModel,
  node: TreeNode,
): string | undefined {
  if (node.attrs.modId) return node.attrs.modId
  let cur: TreeNode | undefined = node
  while (cur) {
    if (cur.tag === 'mod') {
      const key = cur.attrs.id ?? cur.attrs.modId
      return key || undefined
    }
    cur = parentOf(model, cur)
  }
  return undefined
}

/**
 * Count distinct mods represented by the selected components.
 * Uses resolveModLookupKey; orphans with no key fall back to componentId.
 */
export function countSelectedMods(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
): number {
  return listSelectedModCodenames(model, selectedIds).length
}

/** Type shown when the row is a pick from a multi-component mod (not the whole mod). */
const COMPONENT_TYPE_DEGRADE: ReadonlyMap<string, string> = new Map([
  ['compilation', 'minor'],
  ['major', 'medium'],
  ['medium', 'minor'],
])

export interface ResolveModTypeOptions {
  /**
   * When true, keep the catalog type (`<mod>` row, standalone whole-mod component,
   * or a branch collapsed to one component). When false, degrade for a component
   * pick from a multi-component mod.
   */
  asBranch?: boolean
}

/**
 * Resolve mods.csv Type for display.
 * `lookupNode` supplies the codename. Pass `asBranch: true` for whole-mod rows;
 * otherwise degrade compilation→minor, major→medium, medium→minor.
 */
export function resolveModType(
  model: InstallSequenceModel,
  modsByCodename: ReadonlyMap<string, ModInfo>,
  lookupNode: TreeNode,
  options?: ResolveModTypeOptions,
): string | undefined {
  const codename = resolveModLookupKey(model, lookupNode)
  if (!codename) return undefined
  const type = modsByCodename.get(codename)?.type
  if (!hasModField(type)) return undefined
  const asBranch = options?.asBranch ?? lookupNode.tag === 'mod'
  if (asBranch) return type
  return COMPONENT_TYPE_DEGRADE.get(type) ?? type
}

/**
 * Resolve mods.csv Stability for badges via mod lookup (own modId or enclosing `<mod>`).
 * Empty / missing catalog values return undefined (treated as released by badge helpers).
 */
export function resolveModStability(
  model: InstallSequenceModel,
  modsByCodename: ReadonlyMap<string, ModInfo>,
  lookupNode: TreeNode,
): string | undefined {
  const codename = resolveModLookupKey(model, lookupNode)
  if (!codename) return undefined
  const stability = modsByCodename.get(codename)?.stability
  if (!stability) return undefined
  return stability
}
