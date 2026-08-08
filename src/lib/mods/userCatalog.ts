import type {
  DiskStatus,
  ModFieldOverlays,
  ModInfo,
  WorkingMod,
} from './loadMods'

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
  useMaster: boolean
  useAssets: boolean
  release: string
  version: string
  sizeBytes: number | null
  author: string
  type: string
  stability: string
  origin: 'base' | 'user'
  diskStatus: DiskStatus
  overlays: ModFieldOverlays
}

export interface UserCatalogStore {
  version: 1
  mods: StoredModEntry[]
}

function modInfoToStored(
  info: ModInfo,
  origin: 'base' | 'user',
  extras?: Partial<Pick<StoredModEntry, 'diskStatus' | 'overlays'>>,
): StoredModEntry {
  return {
    ...info,
    origin,
    diskStatus: extras?.diskStatus ?? 'not_present',
    overlays: extras?.overlays ?? {},
  }
}

function storedToWorking(entry: StoredModEntry): WorkingMod {
  return {
    codename: entry.codename,
    name: entry.name,
    abbreviation: entry.abbreviation,
    category: entry.category,
    url: entry.url,
    readme: entry.readme,
    game: entry.game,
    useMaster: entry.useMaster ?? false,
    useAssets: entry.useAssets ?? false,
    release: entry.release,
    version: entry.version,
    sizeBytes: entry.sizeBytes,
    author: entry.author,
    type: entry.type,
    stability: entry.stability,
    origin: entry.origin,
    diskStatus: entry.diskStatus,
    overlays: entry.overlays ?? {},
  }
}

/**
 * Merge shipped base catalog into a user working copy.
 * - New base rows are added.
 * - Existing base-origin rows refresh non-overlay fields from base.
 * - Overlays, diskStatus, and user-origin rows are preserved.
 * - Rows dropped from base stay in the working copy.
 */
export function mergeBaseIntoWorkingCopy(
  base: ReadonlyMap<string, ModInfo>,
  existing: readonly StoredModEntry[] | null | undefined,
): StoredModEntry[] {
  const byCode = new Map<string, StoredModEntry>()
  for (const row of existing ?? []) {
    byCode.set(row.codename, {
      ...row,
      useMaster: row.useMaster ?? false,
      useAssets: row.useAssets ?? false,
      overlays: row.overlays ?? {},
      diskStatus: row.diskStatus ?? 'not_present',
    })
  }

  for (const [codename, info] of base) {
    const prev = byCode.get(codename)
    if (!prev) {
      byCode.set(codename, modInfoToStored(info, 'base'))
      continue
    }
    if (prev.origin === 'user') {
      // User-added row with same codename wins; leave as-is.
      continue
    }
    byCode.set(codename, {
      ...modInfoToStored(info, 'base', {
        diskStatus: prev.diskStatus,
        overlays: prev.overlays ?? {},
      }),
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
  const merged = mergeBaseIntoWorkingCopy(base, store?.mods)
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
    const parsed = JSON.parse(raw) as UserCatalogStore
    if (parsed?.version !== 1 || !Array.isArray(parsed.mods)) return null
    return parsed
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
    mods: mergeBaseIntoWorkingCopy(base, existing?.mods),
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
  const entry = modInfoToStored(
    {
      codename,
      name: input.name.trim(),
      abbreviation: input.abbreviation.trim(),
      category: input.category.trim(),
      url: input.url.trim(),
      readme: input.readme.trim(),
      game: input.game.trim(),
      useMaster: !!input.useMaster,
      useAssets: !!input.useAssets,
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
  if (prev.origin !== 'user') {
    throw new Error('Only user-added mods can be edited in the catalog')
  }
  const nextCode = input.codename.trim()
  if (!nextCode) throw new Error('Download ID is required')
  if (
    nextCode !== codename &&
    store.mods.some((m) => m.codename === nextCode)
  ) {
    throw new Error(`Download ID "${nextCode}" already exists`)
  }
  const entry: StoredModEntry = {
    ...prev,
    codename: nextCode,
    name: input.name.trim(),
    abbreviation: input.abbreviation.trim(),
    category: input.category.trim(),
    url: input.url.trim(),
    readme: input.readme.trim(),
    game: input.game.trim(),
    useMaster: !!input.useMaster,
    useAssets: !!input.useAssets,
    release: input.release.trim(),
    version: input.version.trim(),
    sizeBytes: input.sizeBytes,
    author: input.author.trim(),
    type: input.type.trim(),
    stability: input.stability.trim(),
  }
  const mods = [...store.mods]
  mods[idx] = entry
  mods.sort((a, b) => a.codename.localeCompare(b.codename))
  return { version: 1, mods }
}

/** Remove a user-origin catalog entry. Base rows cannot be removed. */
export function removeUserMod(
  store: UserCatalogStore,
  codename: string,
): UserCatalogStore {
  const prev = store.mods.find((m) => m.codename === codename)
  if (!prev) throw new Error(`Unknown mod "${codename}"`)
  if (prev.origin !== 'user') {
    throw new Error('Base catalog mods cannot be removed')
  }
  return {
    version: 1,
    mods: store.mods.filter((m) => m.codename !== codename),
  }
}

export function patchWorkingMod(
  store: UserCatalogStore,
  codename: string,
  patch: Partial<Pick<StoredModEntry, 'diskStatus' | 'overlays'>>,
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
  }
  return { version: 1, mods }
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
  return { version: 1, mods }
}
