import { modsRoot } from '../projects/projectPaths'
import { notifyPathsChanged } from './pathPrefsEvents'
import { readSavedStore } from '../persistence/savedStore'

export type AppDirPaths = {
  backupDir: string
  /** Derived: `{backupDir}/mods` when the main data folder is set. */
  modsDownloadDir: string
}

const STORAGE_KEY = 'infinity-express.app-dirs'

const EMPTY: AppDirPaths = {
  backupDir: '',
  modsDownloadDir: '',
}

function withDerived(backupDir: string): AppDirPaths {
  const trimmed = backupDir.trim()
  return {
    backupDir,
    modsDownloadDir: trimmed ? modsRoot(trimmed) : '',
  }
}

/** Soft-parse: require `backupDir`; ignore legacy `modsDownloadDir` if present. */
function parseBackupDir(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (typeof o.backupDir !== 'string') return null
  return o.backupDir
}

export function readAppDirPaths(): AppDirPaths {
  return readSavedStore(STORAGE_KEY, (value) => {
    const backupDir = parseBackupDir(value)
    return backupDir === null ? null : withDerived(backupDir)
  }, () => ({ ...EMPTY }))
}

/** Persist only the main data folder; mods path is always derived. */
export function writeAppDirPaths(paths: Pick<AppDirPaths, 'backupDir'>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ backupDir: paths.backupDir }))
  notifyPathsChanged()
}
