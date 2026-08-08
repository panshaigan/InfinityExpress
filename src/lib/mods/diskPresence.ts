import type { DiskStatus } from './loadMods'
import type { StoredModEntry, UserCatalogStore } from './userCatalog'

/** Case-insensitive folder lookup: Download ID ↔ subdirectory name. */
export function folderNameSet(
  folderNames: readonly string[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const name of folderNames) {
    const key = name.trim().toLowerCase()
    if (!key || map.has(key)) continue
    map.set(key, name)
  }
  return map
}

/**
 * Resolve on-disk status for a catalog row given folder names under the
 * mods download directory. Keeps `update_available` / `busy` when still present.
 */
export function resolveDiskStatus(
  current: DiskStatus,
  codename: string,
  folders: ReadonlyMap<string, string>,
): DiskStatus {
  const present = folders.has(codename.trim().toLowerCase())
  if (!present) return 'not_present'
  if (current === 'update_available' || current === 'busy') return current
  return 'present'
}

/** Apply presence from a folder-name list to every catalog row. */
export function applyDiskPresence(
  store: UserCatalogStore,
  folderNames: readonly string[],
): UserCatalogStore {
  const folders = folderNameSet(folderNames)
  let changed = false
  const mods: StoredModEntry[] = store.mods.map((mod) => {
    const nextStatus = resolveDiskStatus(mod.diskStatus, mod.codename, folders)
    if (nextStatus === mod.diskStatus) return mod
    changed = true
    return { ...mod, diskStatus: nextStatus }
  })
  if (!changed) return store
  return { version: 1, mods }
}

/** Mark every row not present (no download path / browser). */
export function clearDiskPresence(store: UserCatalogStore): UserCatalogStore {
  let changed = false
  const mods: StoredModEntry[] = store.mods.map((mod) => {
    if (mod.diskStatus === 'not_present') return mod
    changed = true
    return { ...mod, diskStatus: 'not_present' as const }
  })
  if (!changed) return store
  return { version: 1, mods }
}
