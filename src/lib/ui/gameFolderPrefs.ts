import { notifyPathsChanged } from './pathPrefsEvents'

export type GameFolderKey = 'bg1' | 'bg2' | 'iwd' | 'pst'

export type GameFolderPaths = Record<GameFolderKey, string>

const STORAGE_KEY = 'infinity-express.game-folders'

const EMPTY: GameFolderPaths = {
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
