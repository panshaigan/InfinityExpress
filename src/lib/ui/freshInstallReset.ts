/**
 * Dev-only helper: wipe projects + Settings from localStorage for a "fresh install" feel.
 * Does not touch game folders, backups, or mods on disk.
 *
 * PowerShell (preferred): see docs/dev-fresh-install.md
 * DevTools console:
 *   __ieClearFreshInstall()
 *   __ieClearFreshInstall({ chrome: true, catalog: true })
 */

import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from '../desktop/fsDialogs'
import { APP_SESSION_STORAGE_KEY } from './appSessionPrefs'
import { USER_CATALOG_STORAGE_KEY } from '../mods/userCatalog'

/** Projects hub + legacy session migration + engine preset library. */
export const FRESH_INSTALL_PROJECT_KEYS = [
  'infinity-express.projects-v1',
  'infinity-express.projects-migrated-v1',
  'infinity-express.selection-presets-v1',
  'infinity-express.selection-presets-migrated-v1',
  APP_SESSION_STORAGE_KEY,
] as const

/** Settings → App + Vanilla (and legacy game-folder prefs). */
export const FRESH_INSTALL_SETTINGS_KEYS = [
  'infinity-express.app-dirs',
  'infinity-express.vanilla-registry',
  'infinity-express.weidu-path',
  'infinity-express.github-token',
  'infinity-express.game-folders',
  'infinity-express.game-folder-versions',
] as const

/** Chrome / layout prefs (optional). */
export const FRESH_INSTALL_CHROME_KEYS = [
  'infinity-express.rail-collapsed',
  'infinity-express.route-tip-dismissed',
  'infinity-express.detail-collapsed',
  'infinity-express.detail-width',
  'infinity-express.install-console-height',
] as const

export type FreshInstallResetOptions = {
  /** Also reset rail / detail / console layout prefs. Default false. */
  chrome?: boolean
  /** Also clear mods.csv localStorage overlays. Default false. */
  catalog?: boolean
  /** Reload after clearing. Default true. */
  reload?: boolean
}

function removeKeys(keys: readonly string[]): string[] {
  const removed: string[] = []
  for (const key of keys) {
    if (window.localStorage.getItem(key) !== null) removed.push(key)
    window.localStorage.removeItem(key)
  }
  return removed
}

/**
 * Clear project + Settings localStorage keys.
 * Returns the keys that had values before removal (best-effort).
 */
export function clearFreshInstallLocalStorage(
  options: FreshInstallResetOptions = {},
): string[] {
  const removed = [
    ...removeKeys(FRESH_INSTALL_PROJECT_KEYS),
    ...removeKeys(FRESH_INSTALL_SETTINGS_KEYS),
  ]
  if (options.chrome) removed.push(...removeKeys(FRESH_INSTALL_CHROME_KEYS))
  if (options.catalog) removed.push(...removeKeys([USER_CATALOG_STORAGE_KEY]))

  if (options.reload !== false) {
    window.location.reload()
  }
  return removed
}

declare global {
  interface Window {
    /**
     * DevTools helper: wipe projects + Settings (disk untouched).
     * `__ieClearFreshInstall()` or `__ieClearFreshInstall({ chrome: true, catalog: true })`
     */
    __ieClearFreshInstall?: (options?: FreshInstallResetOptions) => string[]
  }
}

/** Expose `window.__ieClearFreshInstall` for the webview / browser console. */
export function installFreshInstallConsoleApi(): void {
  window.__ieClearFreshInstall = (options) => clearFreshInstallLocalStorage(options)
}

/**
 * If the desktop process was started with `IE_FRESH_INSTALL=1`, wipe once and reload.
 * Returns true when a wipe+reload was triggered (caller should not mount the app).
 */
export async function applyFreshInstallEnvFlagIfRequested(): Promise<boolean> {
  if (!isDesktopApp()) return false
  try {
    const wipe = await invoke<boolean>('take_fresh_install_env_flag')
    if (!wipe) return false
    clearFreshInstallLocalStorage({ reload: true })
    return true
  } catch {
    return false
  }
}
