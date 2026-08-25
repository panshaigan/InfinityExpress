export interface CleanupSelection {
  modFolders: boolean
  setupExes: boolean
  debugFiles: boolean
  weiduExternal: boolean
  zstweaksLogs: boolean
  weiduConf: boolean
  /** EET only: delete the entire configured BG1 game folder. */
  bg1Folder: boolean
}

/** Artifact options checked by default; whole BG1 requires opt-in. */
export function defaultCleanupSelection(): CleanupSelection {
  return {
    modFolders: true,
    setupExes: true,
    debugFiles: true,
    weiduExternal: true,
    zstweaksLogs: true,
    weiduConf: true,
    bg1Folder: false,
  }
}

export function hasAnyCleanupSelection(
  selection: CleanupSelection,
  options?: { showBg1Folder?: boolean },
): boolean {
  if (
    selection.modFolders ||
    selection.setupExes ||
    selection.debugFiles ||
    selection.weiduExternal ||
    selection.zstweaksLogs ||
    selection.weiduConf
  ) {
    return true
  }
  return Boolean(options?.showBg1Folder && selection.bg1Folder)
}

export function showBg1FolderCleanupOption(
  game: string | null | undefined,
  bg1Path: string | null | undefined,
): boolean {
  return game === 'eet' && Boolean(bg1Path?.trim())
}

export const CLEANUP_ARTIFACT_OPTIONS: ReadonlyArray<{
  id: keyof Omit<CleanupSelection, 'bg1Folder'>
  label: string
}> = [
  { id: 'modFolders', label: 'Copied mod folders' },
  { id: 'setupExes', label: 'setup-*.exe files' },
  { id: 'debugFiles', label: '*.DEBUG files' },
  { id: 'weiduExternal', label: 'weidu_external folder' },
  { id: 'zstweaksLogs', label: 'zstweaks_logs folder' },
  { id: 'weiduConf', label: 'weidu.conf' },
]
