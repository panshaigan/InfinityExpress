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
  removeUserMods,
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

  const deleteMod = useCallback((codename: string) => {
    setStore((prev) => {
      const next = removeUserMod(prev, codename)
      writeUserCatalogStore(next)
      return next
    })
  }, [])

  const deleteMods = useCallback((codenames: string[]) => {
    if (codenames.length === 0) return
    setStore((prev) => {
      const next = removeUserMods(prev, codenames)
      writeUserCatalogStore(next)
      return next
    })
  }, [])

  const setDiskStatus = useCallback(
    (codename: string, diskStatus: DiskStatus) => {
      setStore((prev) => {
        const next = patchWorkingMod(prev, codename, { diskStatus })
        writeUserCatalogStore(next)
        return next
      })
    },
    [],
  )

  const applyAcquireSuccess = useCallback(
    (
      codename: string,
      overlays: {
        version: string
        release: string
        sizeBytes: number | null
      },
      meta?: { author?: string | null },
    ) => {
      setStore((prev) => {
        const mod = prev.mods.find((m) => m.codename === codename)
        const merged: ModFieldOverlays = {
          ...(mod?.overlays ?? {}),
          version: overlays.version,
          release: overlays.release,
          sizeBytes: overlays.sizeBytes,
        }
        const authorHint = meta?.author?.trim() ?? ''
        const next = patchWorkingMod(prev, codename, {
          diskStatus: 'present',
          overlays: merged,
          ...(mod && !mod.author.trim() && authorHint
            ? { author: authorHint }
            : {}),
        })
        writeUserCatalogStore(next)
        return next
      })
    },
    [],
  )

  const removeFromDisk = useCallback(
    async (codenames: string[]): Promise<{ removed: string[]; errors: string[] }> => {
      const downloadDir = readAppDirPaths().modsDownloadDir.trim()
      const removed: string[] = []
      const errors: string[] = []
      if (!downloadDir) {
        return {
          removed,
          errors: ['Set a main data folder in Settings first.'],
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
      await refreshDiskStatus()
      return { removed, errors }
    },
    [persist, refreshDiskStatus, store],
  )

  return {
    mods,
    modsByCode,
    addMod,
    editMod,
    deleteMod,
    deleteMods,
    setDiskStatus,
    applyAcquireSuccess,
    refreshDiskStatus,
    removeFromDisk,
  }
}
