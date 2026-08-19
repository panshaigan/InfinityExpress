import { engineMatches } from '../engine/matchEngine'
import {
  listWeiduComponents,
  gameDirForPhase,
  readGameWeiduLog,
} from '../desktop/weiduInstall'
import { isDesktopApp } from '../desktop/fsDialogs'
import { readWeiduPath } from '../ui/weiduPrefs'
import {
  componentMatchesExportPhase,
  type ExportPhase,
} from '../export/installOrder'
import { tp2SearchHintFromComponentId } from './modResolution'
import {
  parseWeiduLog,
  resolveGameTp2Path,
  tp2PathsMatch,
  weiduFolderFromTp2Path,
  type WeiduLogEntry,
} from './weiduLog'
import {
  numericSuffixFromComponentId,
  resolveComponentNumber,
} from './weiduResolution'
import type { GameFolderPaths } from '../ui/gameFolderPrefs'
import type {
  ComponentNode,
  InstallSequenceModel,
  SelectedGame,
} from '../xml/schema'
import type {
  InstallPhase,
  InstallStep,
  WeiduComponentInfo,
} from './types'

export interface MappedWeiduLogHit {
  componentId: string
  tp2Path: string
  absoluteTp2Path: string
  stagedFolderName: string
  weiduNumber: number
  languageIndex: number
  phase: InstallPhase
}

export interface WeiduLogImportResult {
  hasLog: boolean
  hits: MappedWeiduLogHit[]
  unmatched: WeiduLogEntry[]
  componentIds: Set<string>
}

export interface WeiduLogMapDeps {
  readLog?: (gameDir: string) => Promise<string>
  listComponents?: (
    weiduPath: string,
    tp2Path: string,
    gameDir: string,
    lang: number,
  ) => Promise<WeiduComponentInfo[]>
  weiduPath?: string
}

function exportPhaseForInstallPhase(phase: InstallPhase): ExportPhase {
  if (phase === 'eet1') return 'eet1'
  if (phase === 'eet') return 'eet'
  return 'all'
}

function logSourcesForGame(
  game: SelectedGame,
  destinations: GameFolderPaths,
): { gameDir: string; phase: InstallPhase }[] {
  if (game === 'eet') {
    return [
      { gameDir: destinations.bg1.trim(), phase: 'eet1' },
      { gameDir: destinations.bg2.trim(), phase: 'eet' },
    ]
  }
  return [{ gameDir: gameDirForPhase(game, 'single', destinations).trim(), phase: 'single' }]
}

function tp2Key(tp2Path: string): string {
  return tp2Path.replace(/\\/g, '/').trim().toLowerCase()
}

function findListing(
  listingsByTp2: ReadonlyMap<string, WeiduComponentInfo[]>,
  tp2Path: string,
): WeiduComponentInfo[] | undefined {
  const direct = listingsByTp2.get(tp2Key(tp2Path))
  if (direct) return direct
  for (const [key, listing] of listingsByTp2) {
    if (tp2PathsMatch(key, tp2Path)) return listing
  }
  return undefined
}

function componentEligible(
  component: ComponentNode,
  game: SelectedGame,
  phase: InstallPhase,
): boolean {
  if (!engineMatches(component.effectiveEngine, game)) return false
  return componentMatchesExportPhase(component, exportPhaseForInstallPhase(phase))
}

function hitFrom(
  component: ComponentNode,
  entry: WeiduLogEntry,
  gameDir: string,
  phase: InstallPhase,
): MappedWeiduLogHit {
  const folder = weiduFolderFromTp2Path(entry.tp2Path)
  return {
    componentId: component.componentId,
    tp2Path: entry.tp2Path,
    absoluteTp2Path: resolveGameTp2Path(gameDir, entry.tp2Path),
    stagedFolderName: folder,
    weiduNumber: entry.componentNumber,
    languageIndex: entry.languageIndex,
    phase,
  }
}

function matchNumberedComponent(
  model: InstallSequenceModel,
  game: SelectedGame,
  phase: InstallPhase,
  folder: string,
  number: number,
): ComponentNode | null {
  const folderLc = folder.toLowerCase()
  for (const c of model.componentsInOrder) {
    if (!componentEligible(c, game, phase)) continue
    const hint = tp2SearchHintFromComponentId(c.componentId)
    if (!hint || hint.toLowerCase() !== folderLc) continue
    if (numericSuffixFromComponentId(c.componentId) !== number) continue
    return c
  }
  return null
}

function matchLabelComponent(
  model: InstallSequenceModel,
  game: SelectedGame,
  phase: InstallPhase,
  listing: WeiduComponentInfo[],
  number: number,
): ComponentNode | null {
  let found: ComponentNode | null = null
  for (const c of model.componentsInOrder) {
    if (numericSuffixFromComponentId(c.componentId) != null) continue
    if (!componentEligible(c, game, phase)) continue
    const resolved = resolveComponentNumber(c, listing)
    if (resolved.weiduNumber !== number) continue
    if (found) return null
    found = c
  }
  return found
}

/** Pure reverse map: log entries → XML component ids (no FS / WeiDU). */
export function mapLogEntriesToComponents(
  model: InstallSequenceModel,
  game: SelectedGame,
  phase: InstallPhase,
  gameDir: string,
  entries: WeiduLogEntry[],
  listingsByTp2: ReadonlyMap<string, WeiduComponentInfo[]>,
): { hits: MappedWeiduLogHit[]; unmatched: WeiduLogEntry[] } {
  const hits: MappedWeiduLogHit[] = []
  const unmatched: WeiduLogEntry[] = []

  for (const entry of entries) {
    const folder = weiduFolderFromTp2Path(entry.tp2Path)
    const numbered = matchNumberedComponent(
      model,
      game,
      phase,
      folder,
      entry.componentNumber,
    )
    if (numbered) {
      hits.push(hitFrom(numbered, entry, gameDir, phase))
      continue
    }

    const listing = findListing(listingsByTp2, entry.tp2Path)
    if (listing && listing.length > 0) {
      const labeled = matchLabelComponent(
        model,
        game,
        phase,
        listing,
        entry.componentNumber,
      )
      if (labeled) {
        hits.push(hitFrom(labeled, entry, gameDir, phase))
        continue
      }
    }
    unmatched.push(entry)
  }

  return { hits, unmatched }
}

const listingCache = new Map<string, WeiduComponentInfo[]>()

function listingCacheKey(
  gameDir: string,
  tp2Path: string,
  lang: number,
): string {
  return `${gameDir.replace(/\\/g, '/').toLowerCase()}::${tp2Key(tp2Path)}::${lang}`
}

async function listForTp2(
  deps: WeiduLogMapDeps,
  weiduPath: string,
  gameDir: string,
  tp2Path: string,
  lang: number,
): Promise<WeiduComponentInfo[] | null> {
  const abs = resolveGameTp2Path(gameDir, tp2Path)
  const cacheKey = listingCacheKey(gameDir, tp2Path, lang)
  const cached = listingCache.get(cacheKey)
  if (cached) return cached
  const list = deps.listComponents ?? listWeiduComponents
  try {
    const listing = await list(weiduPath, abs, gameDir, lang)
    listingCache.set(cacheKey, listing)
    return listing
  } catch {
    return null
  }
}

export async function importInstalledFromDestinations(
  model: InstallSequenceModel,
  game: SelectedGame,
  destinations: GameFolderPaths,
  deps: WeiduLogMapDeps = {},
): Promise<WeiduLogImportResult> {
  const readLog = deps.readLog ?? readGameWeiduLog
  const weiduPath = (deps.weiduPath ?? readWeiduPath()).trim()
  const allHits: MappedWeiduLogHit[] = []
  const allUnmatched: WeiduLogEntry[] = []
  let hasLog = false

  for (const source of logSourcesForGame(game, destinations)) {
    if (!source.gameDir) continue
    let text = ''
    try {
      text = await readLog(source.gameDir)
    } catch {
      text = ''
    }
    if (!text.trim()) continue
    hasLog = true
    const entries = parseWeiduLog(text)
    if (entries.length === 0) continue

    const numberedPass = mapLogEntriesToComponents(
      model,
      game,
      source.phase,
      source.gameDir,
      entries,
      new Map(),
    )

    const leftovers = numberedPass.unmatched
    const listingsByTp2 = new Map<string, WeiduComponentInfo[]>()
    if (
      leftovers.length > 0 &&
      weiduPath &&
      (isDesktopApp() || deps.listComponents)
    ) {
      const unique = new Map<string, WeiduLogEntry>()
      for (const entry of leftovers) {
        const key = tp2Key(entry.tp2Path)
        if (!unique.has(key)) unique.set(key, entry)
      }
      for (const [key, sample] of unique) {
        const listing = await listForTp2(
          deps,
          weiduPath,
          source.gameDir,
          sample.tp2Path,
          sample.languageIndex,
        )
        if (listing) listingsByTp2.set(key, listing)
      }
    }

    const labelPass = mapLogEntriesToComponents(
      model,
      game,
      source.phase,
      source.gameDir,
      leftovers,
      listingsByTp2,
    )
    allHits.push(...numberedPass.hits, ...labelPass.hits)
    allUnmatched.push(...labelPass.unmatched)
  }

  const componentIds = new Set(allHits.map((h) => h.componentId))
  return { hasLog, hits: allHits, unmatched: allUnmatched, componentIds }
}

export function weiduLogImportMessage(result: WeiduLogImportResult): string | null {
  if (!result.hasLog) return null
  const n = result.componentIds.size
  const checked = `Checked ${n} installed component${n === 1 ? '' : 's'} from WeiDU.log`
  if (result.unmatched.length === 0) return `${checked}.`
  return `${checked} (${result.unmatched.length} unmatched).`
}

function hitsByComponentId(
  result: WeiduLogImportResult,
): Map<string, MappedWeiduLogHit> {
  const map = new Map<string, MappedWeiduLogHit>()
  for (const hit of result.hits) map.set(hit.componentId, hit)
  return map
}

export function applyWeiduLogToSteps(
  steps: InstallStep[],
  result: WeiduLogImportResult,
): InstallStep[] {
  const byId = hitsByComponentId(result)
  let changed = false
  const next = steps.map((step) => {
    const hit = byId.get(step.componentId)
    if (hit) {
      const canMark =
        step.status === 'queued' ||
        step.status === 'copying' ||
        step.status === 'alreadyInstalled'
      const needsFill = !step.tp2Path || step.weiduNumber == null
      if (!canMark && !needsFill) return step
      changed = true
      return {
        ...step,
        ...(canMark
          ? { status: 'alreadyInstalled' as const, progress: null }
          : {}),
        ...(needsFill
          ? {
              tp2Path: hit.absoluteTp2Path,
              stagedFolderName: hit.stagedFolderName,
              weiduNumber: hit.weiduNumber,
              languageIndex: hit.languageIndex,
            }
          : {}),
      }
    }
    if (step.status === 'alreadyInstalled') {
      changed = true
      return { ...step, status: 'queued' as const, progress: null }
    }
    return step
  })
  return changed ? next : steps
}
