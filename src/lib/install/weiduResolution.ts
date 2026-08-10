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


export function pickEnglishLanguage(
  languages: WeiduLanguageInfo[],
): { language: ResolvedLanguage | null; error: string | null } {
  if (languages.length === 0) {
    return { language: null, error: 'No languages listed for mod tp2' }
  }
  const english = languages.find((l) => l.name.toLowerCase().includes('english'))
  if (!english) {
    return { language: null, error: 'No English language entry found' }
  }
  return { language: { index: english.index, source: 'auto' }, error: null }
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

function findByName(listing: WeiduComponentInfo[], name: string): WeiduComponentInfo[] {
  const target = name.trim()
  if (!target) return []
  return listing.filter((c) => c.name.trim() === target)
}

function findByLabel(listing: WeiduComponentInfo[], label: string): WeiduComponentInfo[] {
  const target = label.trim()
  if (!target) return []
  return listing.filter((c) => c.label.some((l) => l.trim() === target))
}

export function resolveComponentNumber(
  component: ComponentNode,
  listing: WeiduComponentInfo[],
): ResolutionResult {
  const suffix = numericSuffixFromId(component.componentId)
  if (suffix != null) {
    const hits = findByNumber(listing, suffix)
    if (hits.length === 1) return { weiduNumber: hits[0]!.number, error: null }
    if (hits.length > 1) {
      return {
        weiduNumber: null,
        error: `Ambiguous WeiDU number ${suffix} for ${component.componentId}`,
      }
    }
  }

  const name = component.attrs.name?.trim()
  if (name) {
    const hits = findByName(listing, name)
    if (hits.length === 1) return { weiduNumber: hits[0]!.number, error: null }
    if (hits.length > 1) {
      return {
        weiduNumber: null,
        error: `Ambiguous name match for ${component.componentId}`,
      }
    }
  }

  const label = component.attrs.label?.trim()
  if (label) {
    const hits = findByLabel(listing, label)
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
    error: `Could not resolve WeiDU component number for ${component.componentId}`,
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

/** Collect unique modIds from component nodes. */
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

/** Whether every component in the list belongs to adjustements station ancestry. */
export function isAdjustementsComponent(
  model: InstallSequenceModel,
  componentId: string,
): boolean {
  const node = model.componentsById.get(componentId)
  if (!node) return false
  let cur = node.parentKey ? model.nodesByKey.get(node.parentKey) : undefined
  while (cur) {
    if (cur.tag === 'adjustements') return true
    cur = cur.parentKey ? model.nodesByKey.get(cur.parentKey) : undefined
  }
  return false
}

export function collectAdjustementsModIds(model: InstallSequenceModel): Set<string> {
  const out = new Set<string>()
  for (const c of model.componentsInOrder) {
    if (!isAdjustementsComponent(model, c.componentId)) continue
    const modId = c.attrs.modId?.trim()
    if (modId) out.add(modId)
  }
  return out
}
