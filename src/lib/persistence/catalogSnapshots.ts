import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from '../desktop/fsDialogs'

let currentRevision: string | undefined

export function currentCatalogRevision(): string | undefined {
  return currentRevision
}

export async function contentRevision(contents: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contents))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Browser demo: keep large immutable catalogs out of localStorage's small quota.
async function withCatalogDatabase<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('infinity-express.catalogs', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('xml')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other app tabs to open the saved component catalogs.'))
  })
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('xml', mode)
      const request = operation(transaction.objectStore('xml'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? request.error)
      transaction.onerror = () => reject(transaction.error ?? request.error)
    })
  } finally {
    db.close()
  }
}

export async function readCatalogSnapshot(revision: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error('Invalid saved component catalog reference.')
  const xml = isDesktopApp()
    ? await invoke<string>('read_catalog_snapshot', { revision })
    : await withCatalogDatabase<string | undefined>('readonly', (store) => store.get(revision))
  if (typeof xml !== 'string' || await contentRevision(xml) !== revision) {
    throw new Error('The saved component catalog is missing or damaged. Restore the catalog from a profile backup before opening this project.')
  }
  return xml
}

export async function prepareCatalogSnapshot(xml: string): Promise<string> {
  const revision = await contentRevision(xml)
  if (isDesktopApp()) {
    await invoke('save_catalog_snapshot', { revision, xml })
  } else {
    const existing = await withCatalogDatabase<string | undefined>('readonly', (store) => store.get(revision))
    if (existing !== undefined && existing !== xml) throw new Error('The saved component catalog is damaged.')
    if (existing === undefined) await withCatalogDatabase('readwrite', (store) => store.add(xml, revision))
  }
  currentRevision = revision
  return revision
}
