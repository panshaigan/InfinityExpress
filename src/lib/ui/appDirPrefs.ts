import { modsRoot } from '../projects/projectPaths'
import { notifyPathsChanged } from './pathPrefsEvents'

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
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const backupDir = parseBackupDir(JSON.parse(raw))
    if (backupDir === null) return { ...EMPTY }
    return withDerived(backupDir)
  } catch {
    return { ...EMPTY }
  }
}

/** Persist only the main data folder; mods path is always derived. */
export function writeAppDirPaths(paths: Pick<AppDirPaths, 'backupDir'>): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ backupDir: paths.backupDir }),
    )
    notifyPathsChanged()
  } catch {
    /* private mode / blocked storage */
  }
}
