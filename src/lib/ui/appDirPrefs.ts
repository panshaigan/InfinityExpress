import { notifyPathsChanged } from './pathPrefsEvents'

export type AppDirPaths = {
  modsDownloadDir: string
  backupDir: string
}

const STORAGE_KEY = 'infinity-express.app-dirs'

const EMPTY: AppDirPaths = {
  modsDownloadDir: '',
  backupDir: '',
}

function isAppDirPaths(value: unknown): value is AppDirPaths {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.modsDownloadDir === 'string' && typeof o.backupDir === 'string'
  )
}

export function readAppDirPaths(): AppDirPaths {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed: unknown = JSON.parse(raw)
    if (!isAppDirPaths(parsed)) return { ...EMPTY }
    return { ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

export function writeAppDirPaths(paths: AppDirPaths): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
    notifyPathsChanged()
  } catch {
    /* private mode / blocked storage */
  }
}
