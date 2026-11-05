import { notifyPathsChanged } from './pathPrefsEvents'

const STORAGE_KEY = 'infinity-express.weidu-path'
const BUNDLED_KEY = 'infinity-express.bundled-weidu-path'

/** Drop Windows `\\?\` (or double-escaped `\\\\?\\`) verbatim prefix from stored paths. */
export function stripVerbatimPathPrefix(path: string): string {
  const trimmed = path.trim()
  if (trimmed.startsWith('\\\\\\\\?\\\\')) return trimmed.slice(6)
  if (trimmed.startsWith('\\\\?\\')) return trimmed.slice(4)
  return trimmed
}

export function readWeiduPath(): string {
  try {
    return stripVerbatimPathPrefix(window.localStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return ''
  }
}

export function writeWeiduPath(path: string): void {
  const normalized = stripVerbatimPathPrefix(path)
  window.localStorage.setItem(STORAGE_KEY, normalized)
  window.localStorage.removeItem(BUNDLED_KEY)
  notifyPathsChanged()
}

export function usesBundledWeiduPath(): boolean {
  const current = readWeiduPath()
  return !current || current === window.localStorage.getItem(BUNDLED_KEY)
}

/** Track auto-seeded paths so changing an install/AppImage location can refresh them. */
export function writeBundledWeiduPath(path: string): void {
  const normalized = stripVerbatimPathPrefix(path)
  window.localStorage.setItem(STORAGE_KEY, normalized)
  window.localStorage.setItem(BUNDLED_KEY, normalized)
  notifyPathsChanged()
}
