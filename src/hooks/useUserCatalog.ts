import { useCallback, useEffect, useMemo, useState } from 'react'
import { listSubdirNames, removeModDir } from '../lib/desktop/modFs'
import { isDesktopApp } from '../lib/desktop/fsDialogs'
import { modsByCodename } from '../lib/mods/catalog'
import {
  applyDiskPresence,
  clearDiskPresence,
} from '../lib/mods/diskPresence'
import type { DiskStatus, ModFieldOverlays, WorkingMod } from '../lib/mods/loadMods'
import { workingModsFromStore } from '../lib/mods/userCatalog'
import {
  addUserMod,
  loadOrCreateUserCatalog,
  patchWorkingMod,
  removeUserMod,
  replaceOverlays,
  updateUserMod,
  writeUserCatalogStore,
  type UserCatalogStore,
  type UserModInput,
} from '../lib/mods/userCatalog'
import { readAppDirPaths } from '../lib/ui/appDirPrefs'
import { PATHS_CHANGED_EVENT } from '../lib/ui/pathPrefsEvents'

function initialStore(): UserCatalogStore {
  return loadOrCreateUserCatalog(modsByCodename)
}

export function useUserCatalog() {
  const [store, setStore] = useState<UserCatalogStore>(initialStore)

  const persist = useCallback((next: UserCatalogStore) => {
    writeUserCatalogStore(next)
    setStore(next)
  }, [])

  const mods: WorkingMod[] = useMemo(
    () => workingModsFromStore(store, modsByCodename),
    [store],
  )

  const modsByCode = useMemo(() => {
    const map = new Map<string, WorkingMod>()
    for (const mod of mods) map.set(mod.codename, mod)
    return map
  }, [mods])

  const refreshDiskStatus = useCallback(async () => {
    const downloadDir = readAppDirPaths().modsDownloadDir.trim()
    if (!downloadDir || !isDesktopApp()) {
      setStore((prev) => {
        const next = clearDiskPresence(prev)
        if (next !== prev) writeUserCatalogStore(next)
        return next
      })
      return
    }
    try {
      const folders = await listSubdirNames(downloadDir)
      setStore((prev) => {
        const next = applyDiskPresence(prev, folders)
        if (next !== prev) writeUserCatalogStore(next)
        return next
      })
    } catch {
      setStore((prev) => {
        const next = clearDiskPresence(prev)
        if (next !== prev) writeUserCatalogStore(next)
        return next
      })
    }
  }, [])

  useEffect(() => {
    void refreshDiskStatus()
    function onPathsChanged() {
      void refreshDiskStatus()
    }
    window.addEventListener(PATHS_CHANGED_EVENT, onPathsChanged)
    return () => window.removeEventListener(PATHS_CHANGED_EVENT, onPathsChanged)
  }, [refreshDiskStatus])

  const addMod = useCallback(
    (input: UserModInput) => {
      persist(addUserMod(store, input))
      void refreshDiskStatus()
    },
    [persist, refreshDiskStatus, store],
  )

  const editMod = useCallback(
    (codename: string, input: UserModInput) => {
      persist(updateUserMod(store, codename, input))
      void refreshDiskStatus()
    },
    [persist, refreshDiskStatus, store],
  )

  const deleteMod = useCallback(
    (codename: string) => {
      persist(removeUserMod(store, codename))
    },
    [persist, store],
  )

  const setDiskStatus = useCallback(
    (codename: string, diskStatus: DiskStatus) => {
      persist(patchWorkingMod(store, codename, { diskStatus }))
    },
    [persist, store],
  )

  const removeFromDisk = useCallback(
    async (codenames: string[]): Promise<{ removed: string[]; errors: string[] }> => {
      const downloadDir = readAppDirPaths().modsDownloadDir.trim()
      const removed: string[] = []
      const errors: string[] = []
      if (!downloadDir) {
        return {
          removed,
          errors: ['Set a mods download directory in Settings first.'],
        }
      }
      if (!isDesktopApp()) {
        return {
          removed,
          errors: ['Removing mods from disk requires the desktop app.'],
        }
      }

      let next = store
      for (const code of codenames) {
        const mod = next.mods.find((m) => m.codename === code)
        if (!mod) continue
        try {
          await removeModDir(downloadDir, code)
          next = replaceOverlays(next, code, {}, 'not_present')
          removed.push(code)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push(`${code}: ${message}`)
        }
      }
      if (removed.length > 0) persist(next)
      else if (errors.length === 0) {
        // nothing selected / nothing to do
      }
      await refreshDiskStatus()
      return { removed, errors }
    },
    [persist, refreshDiskStatus, store],
  )

  const applyAcquireStub = useCallback(
    (codenames: string[], kind: 'download' | 'update' | 'check') => {
      let next = store
      for (const code of codenames) {
        if (kind === 'check') {
          const mod = next.mods.find((m) => m.codename === code)
          if (!mod) continue
          if (mod.diskStatus === 'present') {
            const flip = code.length % 2 === 0
            next = patchWorkingMod(next, code, {
              diskStatus: flip ? 'update_available' : 'present',
            })
          }
          continue
        }
        const mod = next.mods.find((m) => m.codename === code)
        if (!mod) continue
        const overlays: ModFieldOverlays = {
          ...mod.overlays,
          version: (mod.overlays.version ?? mod.version) || 'local',
          sizeBytes:
            mod.overlays.sizeBytes !== undefined
              ? mod.overlays.sizeBytes
              : mod.sizeBytes,
        }
        if (kind === 'update') {
          overlays.version = `${overlays.version || 'v0'}+`
          if (overlays.sizeBytes != null) {
            overlays.sizeBytes = Math.round(overlays.sizeBytes * 1.01)
          }
        }
        next = patchWorkingMod(next, code, {
          diskStatus: 'present',
          overlays,
        })
      }
      persist(next)
    },
    [persist, store],
  )

  return {
    mods,
    modsByCode,
    addMod,
    editMod,
    deleteMod,
    setDiskStatus,
    refreshDiskStatus,
    removeFromDisk,
    applyAcquireStub,
  }
}
