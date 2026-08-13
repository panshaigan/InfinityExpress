import { readAppDirPaths } from './appDirPrefs'
import type { GameFolderKey, GameFolderPaths } from './gameFolderPrefs'
import { readWeiduPath } from './weiduPrefs'
import type { SelectedGame } from '../xml/schema'
import {
  missingVanillaKeys,
  readVanillaRegistry,
  type VanillaRegistry,
} from '../projects'

export type MissingInstallPath =
  | 'modsDownloadDir'
  | 'backupDir'
  | 'weiduPath'
  | `vanilla:${GameFolderKey}`
  | `dest:${GameFolderKey}`

export type SettingsFocusField =
  | 'modsDownloadDir'
  | 'backupDir'
  | 'weiduPath'
  | `vanilla:${GameFolderKey}`
  | `dest:${GameFolderKey}`

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

export function getMissingInstallPaths(
  game: SelectedGame | null,
  destinations: GameFolderPaths,
  registry: VanillaRegistry = readVanillaRegistry(),
): MissingInstallPath[] {
  if (!game) return []

  const appDirs = readAppDirPaths()
  const weidu = readWeiduPath()
  const missing: MissingInstallPath[] = []

  for (const key of missingVanillaKeys(game, registry)) {
    missing.push(`vanilla:${key}`)
  }
  for (const key of gameFolderKeysForEngine(game)) {
    if (isEmpty(destinations[key])) missing.push(`dest:${key}`)
  }
  if (isEmpty(appDirs.modsDownloadDir)) missing.push('modsDownloadDir')
  if (isEmpty(appDirs.backupDir)) missing.push('backupDir')
  if (isEmpty(weidu)) missing.push('weiduPath')

  return missing
}

export type SettingsTab = 'project' | 'vanilla' | 'app'

export type SettingsOpenContext = 'wizard' | 'components' | 'mods' | 'install'

export function settingsTabForMissing(key: MissingInstallPath): SettingsTab {
  if (key.startsWith('dest:')) return 'project'
  if (
    key === 'modsDownloadDir' ||
    key === 'backupDir' ||
    key === 'weiduPath'
  ) {
    return 'app'
  }
  return 'vanilla'
}

export function defaultSettingsTabForContext(
  context: SettingsOpenContext,
): SettingsTab {
  if (context === 'components') return 'project'
  if (context === 'mods') return 'app'
  return 'vanilla'
}

export function resolveSettingsOpenTab(opts: {
  focusField?: SettingsFocusField | null
  highlightMissing?: readonly MissingInstallPath[]
  initialTab?: SettingsTab
  hideProjectTab?: boolean
}): SettingsTab {
  let tab: SettingsTab
  if (opts.focusField) {
    tab = settingsTabForMissing(opts.focusField)
  } else if (opts.highlightMissing && opts.highlightMissing.length > 0) {
    tab = settingsTabForMissing(opts.highlightMissing[0]!)
  } else {
    tab = opts.initialTab ?? 'vanilla'
  }
  if (opts.hideProjectTab && tab === 'project') return 'vanilla'
  return tab
}

export function firstMissingFocusField(
  keys: MissingInstallPath[],
): SettingsFocusField | null {
  for (const key of keys) {
    return key as SettingsFocusField
  }
  return null
}

export function focusElementIdForField(field: SettingsFocusField): string {
  if (field === 'modsDownloadDir') return 'settings-mods-download-dir'
  if (field === 'backupDir') return 'settings-backup-dir'
  if (field === 'weiduPath') return 'settings-weidu-path'
  if (field.startsWith('vanilla:')) {
    return `settings-vanilla-${field.slice('vanilla:'.length)}`
  }
  if (field.startsWith('dest:')) {
    return `settings-dest-${field.slice('dest:'.length)}`
  }
  return 'settings-backup-dir'
}

export function countMissingByTab(
  keys: MissingInstallPath[],
): { project: number; vanilla: number; app: number } {
  let project = 0
  let vanilla = 0
  let app = 0
  for (const key of keys) {
    const tab = settingsTabForMissing(key)
    if (tab === 'project') project += 1
    else if (tab === 'vanilla') vanilla += 1
    else app += 1
  }
  return { project, vanilla, app }
}

export function isPathStillMissing(
  key: MissingInstallPath,
  destinations: GameFolderPaths,
): boolean {
  if (key.startsWith('dest:')) {
    const folder = key.slice('dest:'.length) as GameFolderKey
    return isEmpty(destinations[folder])
  }
  if (key.startsWith('vanilla:')) {
    const folder = key.slice('vanilla:'.length) as GameFolderKey
    return isEmpty(readVanillaRegistry()[folder]?.path)
  }
  if (key === 'modsDownloadDir') return isEmpty(readAppDirPaths().modsDownloadDir)
  if (key === 'backupDir') return isEmpty(readAppDirPaths().backupDir)
  if (key === 'weiduPath') return isEmpty(readWeiduPath())
  return false
}
