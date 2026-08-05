import type { InstallSequenceModel, TreeNode } from '../xml/schema'

export interface ModInfo {
  codename: string
  url: string
  readme: string
  release: string
  version: string
  sizeBytes: number | null
  author: string
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
  const iUrl = idx('URL')
  const iReadme = idx('Readme')
  const iRelease = idx('Release')
  const iVersion = idx('Version')
  const iSize = idx('Size')
  const iAuthor = idx('Author')
  if (iCodename < 0) return map

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const codename = (cols[iCodename] ?? '').trim()
    if (!codename || map.has(codename)) continue
    map.set(codename, {
      codename,
      url: (iUrl >= 0 ? cols[iUrl] ?? '' : '').trim(),
      readme: (iReadme >= 0 ? cols[iReadme] ?? '' : '').trim(),
      release: (iRelease >= 0 ? cols[iRelease] ?? '' : '').trim(),
      version: (iVersion >= 0 ? cols[iVersion] ?? '' : '').trim(),
      sizeBytes: iSize >= 0 ? parseSizeBytes(cols[iSize] ?? '') : null,
      author: (iAuthor >= 0 ? cols[iAuthor] ?? '' : '').trim(),
    })
  }
  return map
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
 * Sorted by count descending, then name.
 */
export function collectAuthorOptions(
  map: Map<string, ModInfo>,
  minMods = 3,
): AuthorOption[] {
  const counts = new Map<string, number>()
  for (const mod of map.values()) {
    if (!mod.author) continue
    counts.set(mod.author, (counts.get(mod.author) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minMods)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function parentOf(model: InstallSequenceModel, node: TreeNode): TreeNode | undefined {
  return node.parentKey ? model.nodesByKey.get(node.parentKey) : undefined
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
