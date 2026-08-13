import { notifyPathsChanged } from './pathPrefsEvents'

export type GameFolderKey = 'bg1' | 'bg2' | 'iwd' | 'pst'

export type GameFolderPaths = Record<GameFolderKey, string>

export type GameFolderVersions = Record<GameFolderKey, string>

const STORAGE_KEY = 'infinity-express.game-folders'
const VERSIONS_KEY = 'infinity-express.game-folder-versions'

const EMPTY: GameFolderPaths = {
  bg1: '',
  bg2: '',
  iwd: '',
  pst: '',
}

const EMPTY_VERSIONS: GameFolderVersions = {
  bg1: '',
  bg2: '',
  iwd: '',
  pst: '',
}

function isGameFolderPaths(value: unknown): value is GameFolderPaths {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.bg1 === 'string' &&
    typeof o.bg2 === 'string' &&
    typeof o.iwd === 'string' &&
    typeof o.pst === 'string'
  )
}

function isGameFolderVersions(value: unknown): value is GameFolderVersions {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.bg1 === 'string' &&
    typeof o.bg2 === 'string' &&
    typeof o.iwd === 'string' &&
    typeof o.pst === 'string'
  )
}

export function readGameFolderPaths(): GameFolderPaths {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed: unknown = JSON.parse(raw)
    if (!isGameFolderPaths(parsed)) return { ...EMPTY }
    return { ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

export function writeGameFolderPaths(paths: GameFolderPaths): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
    notifyPathsChanged()
  } catch {
    /* private mode / blocked storage */
  }
}

export function readGameFolderVersions(): GameFolderVersions {
  try {
    const raw = window.localStorage.getItem(VERSIONS_KEY)
    if (!raw) return { ...EMPTY_VERSIONS }
    const parsed: unknown = JSON.parse(raw)
    if (!isGameFolderVersions(parsed)) return { ...EMPTY_VERSIONS }
    return { ...parsed }
  } catch {
    return { ...EMPTY_VERSIONS }
  }
}

export function writeGameFolderVersions(versions: GameFolderVersions): void {
  try {
    window.localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions))
    notifyPathsChanged()
  } catch {
    /* private mode / blocked storage */
  }
}

/** Map install phase / selected game to the folder key used for that game dir. */
export function gameFolderKeyForPhase(
  game: import('../xml/schema').SelectedGame,
  phase: import('../install/types').InstallPhase,
): GameFolderKey {
  if (game === 'eet') return phase === 'eet1' ? 'bg1' : 'bg2'
  if (game === 'bg1' || game === 'bg2' || game === 'iwd' || game === 'pst') return game
  return 'bg2'
}

export function gameFolderKeyLabel(key: string): string {
  if (key === 'bg1') return 'BG1'
  if (key === 'bg2') return 'BG2'
  if (key === 'iwd') return 'IWD'
  if (key === 'pst') return 'PST'
  return key.toUpperCase()
}
