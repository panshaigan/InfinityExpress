import { readAppDirPaths } from './appDirPrefs'
import { readGameFolderPaths, type GameFolderKey } from './gameFolderPrefs'
import { readWeiduPath } from './weiduPrefs'
import type { SelectedGame } from '../xml/schema'

export type MissingInstallPath =
  | GameFolderKey
  | 'modsDownloadDir'
  | 'backupDir'
  | 'weiduPath'

export type SettingsFocusField = MissingInstallPath

const FOLDERS_BY_GAME: Record<SelectedGame, GameFolderKey[]> = {
  bg1: ['bg1'],
  bg2: ['bg2'],
  eet: ['bg1', 'bg2'],
  iwd: ['iwd'],
  pst: ['pst'],
}

export function gameFolderKeysForEngine(game: SelectedGame): GameFolderKey[] {
  return FOLDERS_BY_GAME[game]
}

function isEmpty(value: string | undefined | null): boolean {
  return !value?.trim()
}

export function getMissingInstallPaths(game: SelectedGame | null): MissingInstallPath[] {
  if (!game) return []

  const folders = readGameFolderPaths()
  const appDirs = readAppDirPaths()
  const weidu = readWeiduPath()
  const missing: MissingInstallPath[] = []

  for (const key of gameFolderKeysForEngine(game)) {
    if (isEmpty(folders[key])) missing.push(key)
  }
  if (isEmpty(appDirs.modsDownloadDir)) missing.push('modsDownloadDir')
  if (isEmpty(appDirs.backupDir)) missing.push('backupDir')
  if (isEmpty(weidu)) missing.push('weiduPath')

  return missing
}

export function settingsTabForMissing(
  key: MissingInstallPath,
): 'games' | 'app' {
  if (key === 'modsDownloadDir' || key === 'backupDir' || key === 'weiduPath') {
    return 'app'
  }
  return 'games'
}

export function firstMissingFocusField(
  keys: MissingInstallPath[],
): MissingInstallPath | null {
  return keys[0] ?? null
}

export function focusElementIdForField(field: MissingInstallPath): string {
  if (field === 'modsDownloadDir') return 'settings-mods-download-dir'
  if (field === 'backupDir') return 'settings-backup-dir'
  if (field === 'weiduPath') return 'settings-weidu-path'
  return `settings-game-folder-${field}`
}

export function countMissingByTab(
  keys: MissingInstallPath[],
): { games: number; app: number } {
  let games = 0
  let app = 0
  for (const key of keys) {
    if (settingsTabForMissing(key) === 'games') games += 1
    else app += 1
  }
  return { games, app }
}

export function isPathStillMissing(key: MissingInstallPath): boolean {
  if (key === 'modsDownloadDir' || key === 'backupDir') {
    return isEmpty(readAppDirPaths()[key])
  }
  if (key === 'weiduPath') return isEmpty(readWeiduPath())
  return isEmpty(readGameFolderPaths()[key])
}
