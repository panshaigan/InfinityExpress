import type {
  DiskStatus,
  ModFieldOverlays,
  ModInfo,
  WorkingMod,
} from './loadMods'
import { normalizeDownload, normalizeTrack } from './loadMods'
import { readSavedStore } from '../persistence/savedStore'

export const USER_CATALOG_STORAGE_KEY = 'infinity-express.mods-catalog'

/** Serializable working-copy entry (persisted). */
export interface StoredModEntry {
  codename: string
  name: string
  abbreviation: string
  category: string
  url: string
  readme: string
  game: string
  track: string
  download: string
  release: string
  version: string
  sizeBytes: number | null
  author: string
  type: string
  stability: string
  origin: 'base' | 'user'
  diskStatus: DiskStatus
  overlays: ModFieldOverlays
  /** Keep local fields while the corresponding canonical row remains unchanged. */
  localEdit?: boolean
}

/** Legacy localStorage shape before Track/Download replaced UseMaster/UseAssets. */
type LegacyStoredModEntry = Partial<StoredModEntry> & {
  useMaster?: boolean
  useAssets?: boolean
}

export interface UserCatalogStore {
  version: 1
  mods: StoredModEntry[]
  /** Last canonical metadata per Download ID; detects CSV changes independently of local edits. */
  baseRows?: Record<string, string>
  /** Hidden base rows; a canonical change revives the corresponding row. */
  hiddenBaseCodenames?: string[]
}

/** Migrate a persisted row from legacy booleans to track/download. */
export function migrateStoredModEntry(row: LegacyStoredModEntry): StoredModEntry {
  const hasNewFields =
    typeof row.track === 'string' || typeof row.download === 'string'
  let track = normalizeTrack(typeof row.track === 'string' ? row.track : '')
  let download = normalizeDownload(
    typeof row.download === 'string' ? row.download : '',
    track,
  )
  if (!hasNewFields) {
    if (row.useMaster) track = 'main'
    else if (row.useAssets) download = 'asset'
  }
  return {
    codename: row.codename ?? '',
    name: row.name ?? '',
    abbreviation: row.abbreviation ?? '',
    category: row.category ?? '',
    url: row.url ?? '',
    readme: row.readme ?? '',
    game: row.game ?? '',
    track,
    download,
    release: row.release ?? '',
    version: row.version ?? '',
    sizeBytes: row.sizeBytes ?? null,
    author: row.author ?? '',
    type: row.type ?? '',
    stability: row.stability ?? '',
    origin: row.origin === 'user' ? 'user' : 'base',
    diskStatus: row.diskStatus ?? 'not_present',
    overlays: row.overlays ?? {},
    ...(row.localEdit ? { localEdit: true } : {}),
  }
}

function modInfoToStored(
  info: ModInfo,
  origin: 'base' | 'user',
  extras?: Partial<Pick<StoredModEntry, 'diskStatus' | 'overlays'>>,
): StoredModEntry {
  return {
    ...info,
    track: normalizeTrack(info.track),
    download: normalizeDownload(info.download, info.track),
    origin,
    diskStatus: extras?.diskStatus ?? 'not_present',
    overlays: extras?.overlays ?? {},
  }
}

function storedToWorking(entry: StoredModEntry): WorkingMod {
  const migrated = migrateStoredModEntry(entry)
  return {
    codename: migrated.codename,
    name: migrated.name,
    abbreviation: migrated.abbreviation,
    category: migrated.category,
    url: migrated.url,
    readme: migrated.readme,
    game: migrated.game,
    track: migrated.track,
    download: migrated.download,
    release: migrated.release,
    version: migrated.version,
    sizeBytes: migrated.sizeBytes,
    author: migrated.author,
    type: migrated.type,
    stability: migrated.stability,
    origin: migrated.origin,
    diskStatus: migrated.diskStatus,
    overlays: migrated.overlays ?? {},
  }
}

/**
 * Merge shipped base catalog into a user working copy.
 * Changed canonical rows win over local edits, custom collisions, and tombstones.
 * Local edits to unchanged rows and download state survive. Removed base rows go away.
 */
export function mergeBaseIntoWorkingCopy(
  base: ReadonlyMap<string, ModInfo>,
  existing: readonly StoredModEntry[] | null | undefined,
  hiddenBaseCodenames?: readonly string[] | null,
  previousBase?: Readonly<Record<string, string>>,
): StoredModEntry[] {
  const hidden = new Set(hiddenBaseCodenames ?? [])
  const byCode = new Map<string, StoredModEntry>()
  for (const row of existing ?? []) {
    if (row.origin === 'base' && !base.has(row.codename)) continue
    byCode.set(row.codename, migrateStoredModEntry(row))
  }

  for (const [codename, info] of base) {
    const canonicalChanged = previousBase?.[codename] !== JSON.stringify(info)
    if (!canonicalChanged && hidden.has(codename)) {
      byCode.delete(codename)
      continue
    }
    const prev = byCode.get(codename)
    if (!prev) {
      byCode.set(codename, modInfoToStored(info, 'base'))
      continue
    }
    if (!canonicalChanged && prev.origin === 'user') {
      // User-added row with same codename wins; leave as-is.
      continue
    }
    if (!canonicalChanged && prev.localEdit) {
      // User edited this base row; keep fields, preserve acquire state.
      byCode.set(codename, {
        ...prev,
        origin: 'base',
        localEdit: true,
        diskStatus: prev.diskStatus,
        overlays: prev.overlays ?? {},
      })
      continue
    }
    byCode.set(codename, {
      ...modInfoToStored(info, 'base', {
        diskStatus: prev.diskStatus,
        overlays: prev.overlays ?? {},
      }),
      // Scraped metadata may fill an unchanged blank; a canonical change can clear it.
      author: canonicalChanged ? info.author : info.author.trim() || prev.author,
    })
  }

  return [...byCode.values()].sort((a, b) =>
    a.codename.localeCompare(b.codename),
  )
}

export function workingModsFromStore(
  store: UserCatalogStore | null,
  base: ReadonlyMap<string, ModInfo>,
): WorkingMod[] {
  const merged = mergeBaseIntoWorkingCopy(
    base,
    store?.mods,
    store?.hiddenBaseCodenames,
    store?.baseRows,
  )
  return merged.map(storedToWorking)
}

export function createInitialCatalogStore(
  base: ReadonlyMap<string, ModInfo>,
): UserCatalogStore {
  return {
    version: 1,
    mods: mergeBaseIntoWorkingCopy(base, null),
    baseRows: canonicalBaseRows(base),
  }
}

export function readUserCatalogStore(): UserCatalogStore | null {
  return readSavedStore<UserCatalogStore | null>(USER_CATALOG_STORAGE_KEY, (value) => {
    const parsed = value as UserCatalogStore & {
      mods: LegacyStoredModEntry[]
    }
    if (parsed?.version !== 1 || !Array.isArray(parsed.mods)) return null
    if (parsed.mods.some((row) => !row || typeof row !== 'object' || typeof row.codename !== 'string' || !row.codename.trim())) return null
    if (new Set(parsed.mods.map((row) => row.codename)).size !== parsed.mods.length) return null
    if (parsed.hiddenBaseCodenames !== undefined &&
      (!Array.isArray(parsed.hiddenBaseCodenames) || parsed.hiddenBaseCodenames.some((code) => typeof code !== 'string'))) return null
    if (parsed.baseRows !== undefined && (!parsed.baseRows || typeof parsed.baseRows !== 'object' ||
      Array.isArray(parsed.baseRows) || Object.values(parsed.baseRows).some(value => typeof value !== 'string'))) return null
    return {
      version: 1,
      mods: parsed.mods.map(migrateStoredModEntry),
      hiddenBaseCodenames: parsed.hiddenBaseCodenames,
      baseRows: parsed.baseRows,
    }
  }, () => null)
}

export function writeUserCatalogStore(store: UserCatalogStore): void {
  localStorage.setItem(USER_CATALOG_STORAGE_KEY, JSON.stringify(store))
}

export function loadOrCreateUserCatalog(
  base: ReadonlyMap<string, ModInfo>,
): UserCatalogStore {
  const existing = readUserCatalogStore()
  const store = reconcileUserCatalog(base, existing)
  if (JSON.stringify(store) !== JSON.stringify(existing)) writeUserCatalogStore(store)
  return store
}

function canonicalBaseRows(base: ReadonlyMap<string, ModInfo>): Record<string, string> {
  return Object.fromEntries([...base].map(([code, info]) => [code, JSON.stringify(info)]))
}

export function reconcileUserCatalog(
  base: ReadonlyMap<string, ModInfo>,
  existing: UserCatalogStore | null,
): UserCatalogStore {
  return {
    version: 1,
    mods: mergeBaseIntoWorkingCopy(
      base,
      existing?.mods,
      existing?.hiddenBaseCodenames,
      existing?.baseRows,
    ),
    hiddenBaseCodenames: (existing?.hiddenBaseCodenames ?? []).filter(code =>
      base.has(code) && existing?.baseRows?.[code] === JSON.stringify(base.get(code))),
    baseRows: canonicalBaseRows(base),
  }
}

export type UserModInput = Omit<
  ModInfo,
  never
> & {
  diskStatus?: DiskStatus
}

/**
 * Build a provisional catalog id from a download URL when the user leaves
 * Download ID blank. Uses the last path segment only (no hostname). Collisions
 * get -2, -3, … suffixes.
 */
export function provisionalCodenameFromUrl(
  url: string,
  existing: ReadonlySet<string>,
): string {
  let base = 'user-mod'
  try {
    const parsed = new URL(url.trim())
    const segments = parsed.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
    const last =
      segments[segments.length - 1]?.replace(/\.[a-z0-9]+$/i, '') ?? ''
    const cleaned = last
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    if (cleaned) base = cleaned.slice(0, 64)
  } catch {
    const cleaned = url
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
    if (cleaned) base = cleaned
  }

  if (!existing.has(base)) return base
  let n = 2
  while (existing.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export function addUserMod(
  store: UserCatalogStore,
  input: UserModInput,
): UserCatalogStore {
  const codename = input.codename.trim()
  if (!codename) throw new Error('Download ID is required')
  if (store.mods.some((m) => m.codename === codename)) {
    throw new Error(`Download ID "${codename}" already exists`)
  }
  const track = normalizeTrack(input.track)
  const entry = modInfoToStored(
    {
      codename,
      name: input.name.trim(),
      abbreviation: input.abbreviation.trim(),
      category: input.category.trim(),
      url: input.url.trim(),
      readme: input.readme.trim(),
      game: input.game.trim(),
      track,
      download: normalizeDownload(input.download, track),
      release: input.release.trim(),
      version: input.version.trim(),
      sizeBytes: input.sizeBytes,
      author: input.author.trim(),
      type: input.type.trim(),
      stability: input.stability.trim(),
    },
    'user',
    { diskStatus: input.diskStatus ?? 'not_present' },
  )
  return {
    ...store,
    mods: [...store.mods, entry].sort((a, b) =>
      a.codename.localeCompare(b.codename),
    ),
    hiddenBaseCodenames: (store.hiddenBaseCodenames ?? []).filter(
      (c) => c !== codename,
    ),
  }
}

export function updateUserMod(
  store: UserCatalogStore,
  codename: string,
  input: UserModInput,
): UserCatalogStore {
  const idx = store.mods.findIndex((m) => m.codename === codename)
  if (idx < 0) throw new Error(`Unknown mod "${codename}"`)
  const prev = store.mods[idx]
  const nextCode = input.codename.trim()
  if (!nextCode) throw new Error('Download ID is required')
  if (
    nextCode !== codename &&
    store.mods.some((m) => m.codename === nextCode)
  ) {
    throw new Error(`Download ID "${nextCode}" already exists`)
  }
  const track = normalizeTrack(input.track)
  const entry: StoredModEntry = {
    ...prev,
    origin: prev.origin === 'base' && nextCode !== codename ? 'user' : prev.origin,
    codename: nextCode,
    name: input.name.trim(),
    abbreviation: input.abbreviation.trim(),
    category: input.category.trim(),
    url: input.url.trim(),
    readme: input.readme.trim(),
    game: input.game.trim(),
    track,
    download: normalizeDownload(input.download, track),
    release: input.release.trim(),
    version: input.version.trim(),
    sizeBytes: input.sizeBytes,
    author: input.author.trim(),
    type: input.type.trim(),
    stability: input.stability.trim(),
    localEdit: prev.origin === 'base' && nextCode === codename ? true : undefined,
  }
  let hidden = [...(store.hiddenBaseCodenames ?? [])]
  if (prev.origin === 'base' && nextCode !== codename) {
    // Renamed base row: hide the old shipped codename so merge does not revive it.
    if (!hidden.includes(codename)) hidden.push(codename)
    hidden = hidden.filter((c) => c !== nextCode)
  }
  const mods = [...store.mods]
  mods[idx] = entry
  mods.sort((a, b) => a.codename.localeCompare(b.codename))
  return { ...store, mods, hiddenBaseCodenames: hidden }
}

/** Remove a catalog entry. Base rows are tombstoned so merge does not revive them. */
export function removeUserMod(
  store: UserCatalogStore,
  codename: string,
): UserCatalogStore {
  const prev = store.mods.find((m) => m.codename === codename)
  if (!prev) throw new Error(`Unknown mod "${codename}"`)
  const hidden = [...(store.hiddenBaseCodenames ?? [])]
  if (prev.origin === 'base' && !hidden.includes(codename)) {
    hidden.push(codename)
  }
  return {
    ...store,
    mods: store.mods.filter((m) => m.codename !== codename),
    hiddenBaseCodenames: hidden,
  }
}

/** Remove several catalog entries in one pass (single persist). */
export function removeUserMods(
  store: UserCatalogStore,
  codenames: readonly string[],
): UserCatalogStore {
  let next = store
  for (const codename of codenames) {
    next = removeUserMod(next, codename)
  }
  return next
}

export function patchWorkingMod(
  store: UserCatalogStore,
  codename: string,
  patch: Partial<Pick<StoredModEntry, 'diskStatus' | 'overlays' | 'author'>>,
): UserCatalogStore {
  const idx = store.mods.findIndex((m) => m.codename === codename)
  if (idx < 0) throw new Error(`Unknown mod "${codename}"`)
  const prev = store.mods[idx]
  const mods = [...store.mods]
  mods[idx] = {
    ...prev,
    diskStatus: patch.diskStatus ?? prev.diskStatus,
    overlays: patch.overlays
      ? { ...prev.overlays, ...patch.overlays }
      : prev.overlays,
    author: patch.author !== undefined ? patch.author : prev.author,
  }
  return {
    ...store,
    mods,
    hiddenBaseCodenames: store.hiddenBaseCodenames,
  }
}

export function replaceOverlays(
  store: UserCatalogStore,
  codename: string,
  overlays: ModFieldOverlays,
  diskStatus?: DiskStatus,
): UserCatalogStore {
  const idx = store.mods.findIndex((m) => m.codename === codename)
  if (idx < 0) throw new Error(`Unknown mod "${codename}"`)
  const prev = store.mods[idx]
  const mods = [...store.mods]
  mods[idx] = {
    ...prev,
    overlays,
    diskStatus: diskStatus ?? prev.diskStatus,
  }
  return {
    ...store,
    mods,
    hiddenBaseCodenames: store.hiddenBaseCodenames,
  }
}
