import { useCallback, useMemo, useState } from 'react'
import { modsByCodename } from '../lib/mods/catalog'
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

  const addMod = useCallback(
    (input: UserModInput) => {
      persist(addUserMod(store, input))
    },
    [persist, store],
  )

  const editMod = useCallback(
    (codename: string, input: UserModInput) => {
      persist(updateUserMod(store, codename, input))
    },
    [persist, store],
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

  const applyAcquireStub = useCallback(
    (codenames: string[], kind: 'download' | 'update' | 'check' | 'remove') => {
      let next = store
      for (const code of codenames) {
        if (kind === 'remove') {
          next = replaceOverlays(next, code, {}, 'not_present')
          continue
        }
        if (kind === 'check') {
          const mod = next.mods.find((m) => m.codename === code)
          if (!mod) continue
          if (mod.diskStatus === 'present') {
            // Simulate: half get an update available for UI demos.
            const flip = code.length % 2 === 0
            next = patchWorkingMod(next, code, {
              diskStatus: flip ? 'update_available' : 'present',
            })
          }
          continue
        }
        // download / update — mark present and bump overlay version/size for demo
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
    applyAcquireStub,
  }
}
