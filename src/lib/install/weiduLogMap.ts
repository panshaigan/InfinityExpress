import { engineMatches } from '../engine/matchEngine'
import {
  listWeiduComponents,
  gameDirForPhase,
  readGameWeiduLog,
} from '../desktop/weiduInstall'
import { isDesktopApp } from '../desktop/fsDialogs'
import { readWeiduPath } from '../ui/weiduPrefs'
import { tp2SearchHintFromComponentId } from './modResolution'
import {
  parseWeiduLog,
  resolveGameTp2Path,
  tp2PathsMatch,
  weiduFolderFromTp2Path,
  type WeiduLogEntry,
} from './weiduLog'
import { numericSuffixFromComponentId } from './weiduResolution'
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
  listingErrors: string[]
}

/** Project-session copy of identified WeiDU.log installs. */
export interface PersistedWeiduLogInstalls {
  hasLog: boolean
  componentIds: string[]
  hits: MappedWeiduLogHit[]
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

const INSTALL_PHASES: readonly InstallPhase[] = ['eet1', 'eet', 'single']

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
  folder: string,
  number: number,
): ComponentNode | null {
  const folderLc = folder.toLowerCase()
  for (const c of model.componentsInOrder) {
    if (!engineMatches(c.effectiveEngine, game)) continue
    const hint = tp2SearchHintFromComponentId(c.componentId)
    if (!hint || hint.toLowerCase() !== folderLc) continue
    if (numericSuffixFromComponentId(c.componentId) !== number) continue
    return c
  }
  return null
}

/** LABEL id → node, case-insensitive (skips `folder:N` ids). */
function labelComponentIndex(
  model: InstallSequenceModel,
): Map<string, ComponentNode> {
  const index = new Map<string, ComponentNode>()
  for (const c of model.componentsInOrder) {
    if (numericSuffixFromComponentId(c.componentId) != null) continue
    index.set(c.componentId.toLowerCase(), c)
    const attrId = c.attrs.id?.trim()
    if (attrId) index.set(attrId.toLowerCase(), c)
  }
  return index
}

/**
 * Invert resolveComponentNumber: listing row `number` → `label[]` → XML id.
 */
function matchLabelFromListing(
  byLabel: Map<string, ComponentNode>,
  game: SelectedGame,
  listing: WeiduComponentInfo[],
  number: number,
): ComponentNode | null {
  const labels: string[] = []
  for (const row of listing) {
    if (row.number !== number) continue
    for (const label of row.label) {
      const trimmed = label.trim()
      if (trimmed) labels.push(trimmed)
    }
  }
  for (const label of labels) {
    const node = byLabel.get(label.toLowerCase())
    if (!node) continue
    if (numericSuffixFromComponentId(node.componentId) != null) continue
    if (!engineMatches(node.effectiveEngine, game)) continue
    return node
  }
  return null
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
  const byLabel = labelComponentIndex(model)

  for (const entry of entries) {
    const folder = weiduFolderFromTp2Path(entry.tp2Path)
    const numbered = matchNumberedComponent(
      model,
      game,
      folder,
      entry.componentNumber,
    )
    if (numbered) {
      hits.push(hitFrom(numbered, entry, gameDir, phase))
      continue
    }

    const listing = findListing(listingsByTp2, entry.tp2Path)
    if (listing && listing.length > 0) {
      const labeled = matchLabelFromListing(
        byLabel,
        game,
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
): Promise<{ listing: WeiduComponentInfo[] | null; error: string | null }> {
  const abs = resolveGameTp2Path(gameDir, tp2Path)
  const cacheKey = listingCacheKey(gameDir, tp2Path, lang)
  const cached = listingCache.get(cacheKey)
  if (cached) return { listing: cached, error: null }
  const list = deps.listComponents ?? listWeiduComponents
  try {
    const listing = await list(weiduPath, abs, gameDir, lang)
    listingCache.set(cacheKey, listing)
    return { listing, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      listing: null,
      error: `Could not list components for ${tp2Path}: ${message}`,
    }
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
  const listingErrors: string[] = []
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
        const { listing, error } = await listForTp2(
          deps,
          weiduPath,
          source.gameDir,
          sample.tp2Path,
          sample.languageIndex,
        )
        if (listing) listingsByTp2.set(key, listing)
        if (error) listingErrors.push(error)
      }
    } else if (leftovers.length > 0 && !weiduPath) {
      const missing =
        'WeiDU.exe is not set — labelled components were not mapped from WeiDU.log'
      if (!listingErrors.includes(missing)) listingErrors.push(missing)
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
  return {
    hasLog,
    hits: allHits,
    unmatched: allUnmatched,
    componentIds,
    listingErrors,
  }
}

export function weiduLogImportMessage(result: WeiduLogImportResult): string | null {
  if (!result.hasLog) return null
  const n = result.componentIds.size
  const checked = `Checked ${n} installed component${n === 1 ? '' : 's'} from WeiDU.log`
  const extra: string[] = []
  if (result.unmatched.length > 0) extra.push(`${result.unmatched.length} unmatched`)
  if (result.listingErrors.length > 0) extra.push(`${result.listingErrors.length} list errors`)
  if (extra.length === 0) return `${checked}.`
  return `${checked} (${extra.join(', ')}).`
}

export function weiduLogImportToPersisted(
  result: WeiduLogImportResult,
): PersistedWeiduLogInstalls {
  return {
    hasLog: result.hasLog,
    componentIds: [...result.componentIds].sort(),
    hits: result.hits.map((h) => ({ ...h })),
  }
}

export function persistedWeiduLogToImport(
  persisted: PersistedWeiduLogInstalls | null | undefined,
): WeiduLogImportResult | null {
  if (!persisted) return null
  return {
    hasLog: persisted.hasLog,
    hits: persisted.hits.map((h) => ({ ...h })),
    unmatched: [],
    componentIds: new Set(persisted.componentIds),
    listingErrors: [],
  }
}

function hitKey(componentId: string, phase: InstallPhase): string {
  return `${componentId}::${phase}`
}

/** Union identified hits. Live scan wins on the same (componentId, phase). */
export function mergeWeiduLogImports(
  previous: WeiduLogImportResult | null | undefined,
  live: WeiduLogImportResult,
): WeiduLogImportResult {
  if (!previous || !live.hasLog) return live
  const byKey = new Map<string, MappedWeiduLogHit>()
  for (const hit of previous.hits) byKey.set(hitKey(hit.componentId, hit.phase), hit)
  for (const hit of live.hits) byKey.set(hitKey(hit.componentId, hit.phase), hit)
  const hits = [...byKey.values()]
  return {
    hasLog: previous.hasLog || live.hasLog,
    hits,
    unmatched: live.unmatched,
    componentIds: new Set(hits.map((h) => h.componentId)),
    listingErrors: live.listingErrors,
  }
}

export function sanitizePersistedWeiduLogInstalls(
  persisted: PersistedWeiduLogInstalls | null | undefined,
  knownIds: ReadonlySet<string>,
): PersistedWeiduLogInstalls | undefined {
  if (!persisted) return undefined
  const hits = persisted.hits.filter((h) => knownIds.has(h.componentId))
  const componentIds = persisted.componentIds.filter((id) => knownIds.has(id))
  return {
    hasLog: persisted.hasLog,
    componentIds,
    hits,
  }
}

function hitsByComponentPhase(
  result: WeiduLogImportResult,
): Map<string, MappedWeiduLogHit> {
  const map = new Map<string, MappedWeiduLogHit>()
  for (const hit of result.hits) map.set(hitKey(hit.componentId, hit.phase), hit)
  return map
}

export function applyWeiduLogToSteps(
  steps: InstallStep[],
  result: WeiduLogImportResult | null | undefined,
): InstallStep[] {
  if (!result) return steps
  const byKey = hitsByComponentPhase(result)
  let changed = false
  const next = steps.map((step) => {
    const hit = byKey.get(hitKey(step.componentId, step.phase))
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

function isInstallPhase(value: unknown): value is InstallPhase {
  return typeof value === 'string' && INSTALL_PHASES.includes(value as InstallPhase)
}

export function persistedWeiduLogInstallsFrom(
  value: unknown,
): PersistedWeiduLogInstalls | undefined {
  if (!value || typeof value !== 'object') return undefined
  const o = value as Record<string, unknown>
  const hits: MappedWeiduLogHit[] = []
  if (Array.isArray(o.hits)) {
    for (const item of o.hits) {
      if (!item || typeof item !== 'object') continue
      const h = item as Record<string, unknown>
      if (typeof h.componentId !== 'string' || !h.componentId.trim()) continue
      if (typeof h.tp2Path !== 'string') continue
      if (typeof h.absoluteTp2Path !== 'string') continue
      if (typeof h.stagedFolderName !== 'string') continue
      if (typeof h.weiduNumber !== 'number' || !Number.isFinite(h.weiduNumber)) continue
      if (typeof h.languageIndex !== 'number' || !Number.isFinite(h.languageIndex)) {
        continue
      }
      if (!isInstallPhase(h.phase)) continue
      hits.push({
        componentId: h.componentId,
        tp2Path: h.tp2Path,
        absoluteTp2Path: h.absoluteTp2Path,
        stagedFolderName: h.stagedFolderName,
        weiduNumber: h.weiduNumber,
        languageIndex: h.languageIndex,
        phase: h.phase,
      })
    }
  }
  const fromHits = hits.map((h) => h.componentId)
  const ids = [
    ...new Set([
      ...(Array.isArray(o.componentIds)
        ? o.componentIds.filter((v): v is string => typeof v === 'string')
        : []),
      ...fromHits,
    ]),
  ]
  return {
    hasLog: o.hasLog === true || hits.length > 0,
    componentIds: ids,
    hits,
  }
}
