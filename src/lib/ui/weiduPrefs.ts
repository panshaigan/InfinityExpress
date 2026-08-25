import { notifyPathsChanged } from './pathPrefsEvents'

const STORAGE_KEY = 'infinity-express.weidu-path'

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
  try {
    const normalized = stripVerbatimPathPrefix(path)
    window.localStorage.setItem(STORAGE_KEY, normalized)
    notifyPathsChanged()
  } catch {
    /* private mode / blocked storage */
  }
}
