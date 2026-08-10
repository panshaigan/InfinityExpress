import {
  listWeiduComponents,
  listWeiduLanguages,
  stageModIntoGameDir,
} from '../desktop/weiduInstall'
import type { ComponentNode } from '../xml/schema'
import type { ModListingCache, ModListingCacheEntry, WeiduComponentInfo } from './types'
import {
  pickEnglishLanguage,
  resolveComponentNumber,
  type ResolutionResult,
} from './weiduResolution'

export interface ModResolutionResult {
  tp2Path: string
  stagedFolderName: string
  languageIndex: number | null
  languageError: string | null
  componentResults: Map<string, ResolutionResult>
  listing: WeiduComponentInfo[]
}

function cacheKey(gameDir: string, modId: string): string {
  return `${gameDir.replace(/\\/g, '/').toLowerCase()}::${modId.toLowerCase()}`
}

/** Resolve tp2 + WeiDU numbers for one mod's components. Uses per-run cache. */
export async function resolveModForInstall(
  cache: ModListingCache,
  weiduPath: string,
  modsDownloadDir: string,
  gameDir: string,
  modId: string,
  components: ComponentNode[],
): Promise<ModResolutionResult> {
  const key = cacheKey(gameDir, modId)
  let entry = cache.get(key)
  let tp2Path = entry?.tp2Path ?? ''
  let stagedFolderName = ''

  if (!entry) {
    tp2Path = await stageModIntoGameDir(modsDownloadDir, modId, gameDir)
    const normalized = tp2Path.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    stagedFolderName = parts.length >= 2 ? parts[parts.length - 2]! : modId

    const languages = await listWeiduLanguages(weiduPath, tp2Path)
    const { language, error: languageError } = pickEnglishLanguage(languages)
    const langIndex = language?.index ?? 0
    const componentsListing = await listWeiduComponents(weiduPath, tp2Path, langIndex)
    entry = {
      tp2Path,
      components: componentsListing,
      languages,
      language,
    } satisfies ModListingCacheEntry
    cache.set(key, entry)

    if (languageError && !language) {
      return {
        tp2Path,
        stagedFolderName,
        languageIndex: null,
        languageError,
        componentResults: new Map(
          components.map((c) => [
            c.componentId,
            { weiduNumber: null, error: languageError },
          ]),
        ),
        listing: componentsListing,
      }
    }
  } else {
    tp2Path = entry.tp2Path
    const normalized = tp2Path.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    stagedFolderName = parts.length >= 2 ? parts[parts.length - 2]! : modId
  }

  const componentResults = new Map<string, ResolutionResult>()
  for (const c of components) {
    componentResults.set(
      c.componentId,
      resolveComponentNumber(c, entry.components),
    )
  }

  return {
    tp2Path,
    stagedFolderName,
    languageIndex: entry.language?.index ?? null,
    languageError: entry.language ? null : 'No English language resolved',
    componentResults,
    listing: entry.components,
  }
}
