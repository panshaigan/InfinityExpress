import { webcrypto } from 'node:crypto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareCatalogSnapshot, readCatalogSnapshot } from './catalogSnapshots'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }))

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

describe('browser catalog persistence', () => {
  it('keeps multiple XML revisions in IndexedDB without consuming project localStorage', async () => {
    localStorage.setItem('infinity-express.projects-v1', 'project metadata')
    const oldRevision = await prepareCatalogSnapshot('<installSequence>old XML</installSequence>')
    const newRevision = await prepareCatalogSnapshot('<installSequence>new XML</installSequence>')
    expect(await readCatalogSnapshot(oldRevision)).toContain('old XML')
    expect(await readCatalogSnapshot(newRevision)).toContain('new XML')
    expect(await prepareCatalogSnapshot('<installSequence>old XML</installSequence>')).toBe(oldRevision)
    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem('infinity-express.projects-v1')).toBe('project metadata')
  })

  it('reports missing catalog storage and quota failures instead of using a different XML', async () => {
    const revision = await prepareCatalogSnapshot('original')
    vi.stubGlobal('indexedDB', new IDBFactory())
    await expect(readCatalogSnapshot(revision)).rejects.toThrow('missing or damaged')
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('quota exceeded', 'QuotaExceededError') })
    await expect(prepareCatalogSnapshot('new')).rejects.toThrow('quota exceeded')
  })
})
