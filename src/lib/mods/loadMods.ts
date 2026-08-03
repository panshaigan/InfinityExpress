import type { InstallSequenceModel, TreeNode } from '../xml/schema'

export interface ModInfo {
  codename: string
  url: string
  release: string
  version: string
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
  const iRelease = idx('Release')
  const iVersion = idx('Version')
  if (iCodename < 0) return map

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const codename = (cols[iCodename] ?? '').trim()
    if (!codename || map.has(codename)) continue
    map.set(codename, {
      codename,
      url: (iUrl >= 0 ? cols[iUrl] ?? '' : '').trim(),
      release: (iRelease >= 0 ? cols[iRelease] ?? '' : '').trim(),
      version: (iVersion >= 0 ? cols[iVersion] ?? '' : '').trim(),
    })
  }
  return map
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
