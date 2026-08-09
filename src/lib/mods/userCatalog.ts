import type {
  DiskStatus,
  ModFieldOverlays,
  ModInfo,
  WorkingMod,
} from './loadMods'
import { normalizeDownload, normalizeTrack } from './loadMods'

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
  /** When true, merge keeps this base row's fields instead of refreshing from CSV. */
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
  /** Base codenames removed from the working catalog (not re-added on merge). */
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
 * - New base rows are added (unless hidden).
 * - Existing base-origin rows refresh non-overlay fields from base unless localEdit.
 * - Overlays, diskStatus, localEdit rows, and user-origin rows are preserved.
 * - Rows dropped from base stay in the working copy.
 */
export function mergeBaseIntoWorkingCopy(
  base: ReadonlyMap<string, ModInfo>,
  existing: readonly StoredModEntry[] | null | undefined,
  hiddenBaseCodenames?: readonly string[] | null,
): StoredModEntry[] {
  const hidden = new Set(hiddenBaseCodenames ?? [])
  const byCode = new Map<string, StoredModEntry>()
  for (const row of existing ?? []) {
    byCode.set(row.codename, migrateStoredModEntry(row))
  }

  for (const [codename, info] of base) {
    if (hidden.has(codename)) {
      byCode.delete(codename)
      continue
    }
    const prev = byCode.get(codename)
    if (!prev) {
      byCode.set(codename, modInfoToStored(info, 'base'))
      continue
    }
    if (prev.origin === 'user') {
      // User-added row with same codename wins; leave as-is.
      continue
    }
    if (prev.localEdit) {
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
      // Keep acquire-filled author when CSV left it blank
      author: info.author.trim() || prev.author,
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
  )
  return merged.map(storedToWorking)
}

export function createInitialCatalogStore(
  base: ReadonlyMap<string, ModInfo>,
): UserCatalogStore {
  return {
    version: 1,
    mods: mergeBaseIntoWorkingCopy(base, null),
  }
}

export function readUserCatalogStore(): UserCatalogStore | null {
  try {
    const raw = localStorage.getItem(USER_CATALOG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserCatalogStore & {
      mods: LegacyStoredModEntry[]
    }
    if (parsed?.version !== 1 || !Array.isArray(parsed.mods)) return null
    return {
      version: 1,
      mods: parsed.mods.map(migrateStoredModEntry),
      hiddenBaseCodenames: parsed.hiddenBaseCodenames,
    }
  } catch {
    return null
  }
}

export function writeUserCatalogStore(store: UserCatalogStore): void {
  localStorage.setItem(USER_CATALOG_STORAGE_KEY, JSON.stringify(store))
}

export function loadOrCreateUserCatalog(
  base: ReadonlyMap<string, ModInfo>,
): UserCatalogStore {
  const existing = readUserCatalogStore()
  const store: UserCatalogStore = {
    version: 1,
    mods: mergeBaseIntoWorkingCopy(
      base,
      existing?.mods,
      existing?.hiddenBaseCodenames,
    ),
    hiddenBaseCodenames: existing?.hiddenBaseCodenames ?? [],
  }
  writeUserCatalogStore(store)
  return store
}

export type UserModInput = Omit<
  ModInfo,
  never
> & {
  diskStatus?: DiskStatus
}

/**
 * Build a provisional catalog id from a download URL when the user leaves
 * Download ID blank. Collisions get -2, -3, … suffixes.
 */
export function provisionalCodenameFromUrl(
  url: string,
  existing: ReadonlySet<string>,
): string {
  let base = 'user-mod'
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.replace(/^www\./i, '')
    const segments = parsed.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
    const last = segments[segments.length - 1]?.replace(/\.[a-z0-9]+$/i, '') ?? ''
    const raw = [host, last].filter(Boolean).join('-') || host || 'user-mod'
    const cleaned = raw
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
    version: 1,
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
    localEdit: prev.origin === 'base' ? true : prev.localEdit,
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
  return { version: 1, mods, hiddenBaseCodenames: hidden }
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
    version: 1,
    mods: store.mods.filter((m) => m.codename !== codename),
    hiddenBaseCodenames: hidden,
  }
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
    version: 1,
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
    version: 1,
    mods,
    hiddenBaseCodenames: store.hiddenBaseCodenames,
  }
}
