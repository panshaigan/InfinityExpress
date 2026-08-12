import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FRESH_INSTALL_CHROME_KEYS,
  FRESH_INSTALL_PROJECT_KEYS,
  FRESH_INSTALL_SETTINGS_KEYS,
  clearFreshInstallLocalStorage,
  installFreshInstallConsoleApi,
} from './freshInstallReset'
import { USER_CATALOG_STORAGE_KEY } from '../mods/userCatalog'

afterEach(() => {
  window.localStorage.clear()
  delete window.__ieClearFreshInstall
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('clearFreshInstallLocalStorage', () => {
  it('removes project and settings keys without touching chrome/catalog by default', () => {
    for (const k of FRESH_INSTALL_PROJECT_KEYS) window.localStorage.setItem(k, '1')
    for (const k of FRESH_INSTALL_SETTINGS_KEYS) window.localStorage.setItem(k, '1')
    window.localStorage.setItem(FRESH_INSTALL_CHROME_KEYS[0], '1')
    window.localStorage.setItem(USER_CATALOG_STORAGE_KEY, '{}')

    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    const removed = clearFreshInstallLocalStorage({ reload: true })

    for (const k of FRESH_INSTALL_PROJECT_KEYS) {
      expect(window.localStorage.getItem(k)).toBeNull()
    }
    for (const k of FRESH_INSTALL_SETTINGS_KEYS) {
      expect(window.localStorage.getItem(k)).toBeNull()
    }
    expect(window.localStorage.getItem(FRESH_INSTALL_CHROME_KEYS[0])).toBe('1')
    expect(window.localStorage.getItem(USER_CATALOG_STORAGE_KEY)).toBe('{}')
    expect(removed).toEqual(
      expect.arrayContaining([
        ...FRESH_INSTALL_PROJECT_KEYS,
        ...FRESH_INSTALL_SETTINGS_KEYS,
      ]),
    )
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('optionally clears chrome and catalog', () => {
    window.localStorage.setItem(FRESH_INSTALL_CHROME_KEYS[0], '1')
    window.localStorage.setItem(USER_CATALOG_STORAGE_KEY, '{}')
    clearFreshInstallLocalStorage({ chrome: true, catalog: true, reload: false })
    expect(window.localStorage.getItem(FRESH_INSTALL_CHROME_KEYS[0])).toBeNull()
    expect(window.localStorage.getItem(USER_CATALOG_STORAGE_KEY)).toBeNull()
  })
})

describe('installFreshInstallConsoleApi', () => {
  it('exposes window.__ieClearFreshInstall', () => {
    installFreshInstallConsoleApi()
    expect(typeof window.__ieClearFreshInstall).toBe('function')
    window.localStorage.setItem('infinity-express.projects-v1', '{}')
    window.__ieClearFreshInstall!({ reload: false })
    expect(window.localStorage.getItem('infinity-express.projects-v1')).toBeNull()
  })
})

describe('applyFreshInstallEnvFlagIfRequested', () => {
  it('returns false outside the desktop app', async () => {
    const { applyFreshInstallEnvFlagIfRequested } = await import('./freshInstallReset')
    await expect(applyFreshInstallEnvFlagIfRequested()).resolves.toBe(false)
  })
})
