import type { ComponentNode, InstallSequenceModel } from '../xml/schema'
import type {
  ResolvedLanguage,
  WeiduComponentInfo,
  WeiduLanguageInfo,
} from './types'

export interface ResolutionResult {
  weiduNumber: number | null
  error: string | null
}

export interface ModResolutionBundle {
  tp2Path: string
  components: WeiduComponentInfo[]
  language: ResolvedLanguage | null
  languageError: string | null
  componentResults: Map<string, ResolutionResult>
}


/**
 * Prefer an English TRA entry when present; otherwise use the first listed
 * language. Textless mods often declare a single non-English (or placeholder)
 * LANGUAGE block — WeiDU still needs a valid --language index to install.
 */
export function pickEnglishLanguage(
  languages: WeiduLanguageInfo[],
): { language: ResolvedLanguage | null; error: string | null } {
  if (languages.length === 0) {
    return { language: null, error: 'No languages listed for mod tp2' }
  }
  const english = languages.find((l) => l.name.toLowerCase().includes('english'))
  const chosen = english ?? languages[0]!
  return { language: { index: chosen.index, source: 'auto' }, error: null }
}

function numericSuffixFromId(componentId: string): number | null {
  const idx = componentId.lastIndexOf(':')
  if (idx < 0) return null
  const tail = componentId.slice(idx + 1)
  if (!/^\d+$/.test(tail)) return null
  return Number.parseInt(tail, 10)
}

function findByNumber(
  listing: WeiduComponentInfo[],
  number: number,
): WeiduComponentInfo[] {
  return listing.filter((c) => c.number === number)
}

function findByLabel(listing: WeiduComponentInfo[], label: string): WeiduComponentInfo[] {
  const target = label.trim()
  if (!target) return []
  return listing.filter((c) => c.label.some((l) => l.trim() === target))
}

/**
 * Map an InstallSequence component to a WeiDU component number.
 *
 * - `mod:N` ids → designated number N (verified against listing when present).
 * - Otherwise treat `componentId` as a WeiDU LABEL and look it up in listing `label[]`.
 * - Never match XML display `attrs.label` / `attrs.name` (UI strings, not WeiDU LABELs).
 */
export function resolveComponentNumber(
  component: ComponentNode,
  listing: WeiduComponentInfo[],
): ResolutionResult {
  const suffix = numericSuffixFromId(component.componentId)
  if (suffix != null) {
    if (listing.length === 0) {
      return { weiduNumber: suffix, error: null }
    }
    const hits = findByNumber(listing, suffix)
    if (hits.length === 1) return { weiduNumber: hits[0]!.number, error: null }
    if (hits.length > 1) {
      return {
        weiduNumber: null,
        error: `Ambiguous WeiDU number ${suffix} for ${component.componentId}`,
      }
    }
    return {
      weiduNumber: null,
      error: `WeiDU number ${suffix} not found for ${component.componentId}`,
    }
  }

  const labelKeys = [component.componentId, component.attrs.id]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s)
  const uniqueKeys = [...new Set(labelKeys)]

  for (const key of uniqueKeys) {
    const hits = findByLabel(listing, key)
    if (hits.length === 1) return { weiduNumber: hits[0]!.number, error: null }
    if (hits.length > 1) {
      return {
        weiduNumber: null,
        error: `Ambiguous label match for ${component.componentId}`,
      }
    }
  }

  return {
    weiduNumber: null,
    error: `Could not resolve WeiDU LABEL for ${component.componentId}`,
  }
}

export function resolveModComponents(
  components: ComponentNode[],
  listing: WeiduComponentInfo[],
): Map<string, ResolutionResult> {
  const out = new Map<string, ResolutionResult>()
  for (const c of components) {
    out.set(c.componentId, resolveComponentNumber(c, listing))
  }
  return out
}

/** Collect unique XML download modIds from component nodes. */
export function uniqueModIds(components: ComponentNode[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of components) {
    const modId = c.attrs.modId?.trim()
    if (!modId || seen.has(modId)) continue
    seen.add(modId)
    out.push(modId)
  }
  return out
}

/** Whether every component in the list belongs to adjustments station ancestry. */
export function isadjustmentsComponent(
  model: InstallSequenceModel,
  componentId: string,
): boolean {
  const node = model.componentsById.get(componentId)
  if (!node) return false
  let cur = node.parentKey ? model.nodesByKey.get(node.parentKey) : undefined
  while (cur) {
    if (cur.tag === 'adjustments') return true
    cur = cur.parentKey ? model.nodesByKey.get(cur.parentKey) : undefined
  }
  return false
}

export function collectadjustmentsModIds(model: InstallSequenceModel): Set<string> {
  const out = new Set<string>()
  for (const c of model.componentsInOrder) {
    if (!isadjustmentsComponent(model, c.componentId)) continue
    const modId = c.attrs.modId?.trim()
    if (modId) out.add(modId)
  }
  return out
}
