import { isTauri, invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

export function isDesktopApp(): boolean {
  return isTauri()
}

/** Opens a native save dialog and writes UTF-8 text. Returns false if cancelled. */
export async function saveTextFile(
  defaultName: string,
  contents: string,
): Promise<boolean> {
  if (!isDesktopApp()) return false
  const isCsv = /\.csv$/i.test(defaultName)
  const path = await save({
    defaultPath: defaultName,
    filters: isCsv
      ? [{ name: 'CSV', extensions: ['csv'] }]
      : [{ name: 'Text', extensions: ['txt'] }],
  })
  if (!path) return false
  await writeTextFile(path, contents)
  return true
}

/** Opens a native file picker. Returns null if cancelled or not in Tauri. */
export async function pickFile(title?: string): Promise<string | null> {
  if (!isDesktopApp()) return null
  const selected = await open({
    directory: false,
    multiple: false,
    title,
  })
  if (typeof selected !== 'string') return null
  return selected
}

/** Opens a native directory picker. Returns null if cancelled or not in Tauri. */
export async function pickDirectory(title?: string): Promise<string | null> {
  if (!isDesktopApp()) return null
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  })
  if (typeof selected !== 'string') return null
  return selected
}

/** Read UTF-8 text from an absolute path. Returns null if unavailable or on error. */
export async function readTextFile(path: string): Promise<string | null> {
  if (!isDesktopApp() || !path.trim()) return null
  try {
    return await invoke<string>('read_text_file', { path: path.trim() })
  } catch {
    return null
  }
}

/** True when the path is a file with length greater than zero. */
export async function fileIsNonempty(path: string): Promise<boolean> {
  if (!isDesktopApp() || !path.trim()) return false
  try {
    return await invoke<boolean>('file_is_nonempty', { path: path.trim() })
  } catch {
    return false
  }
}

/** Read up to the last `maxBytes` of a UTF-8 text file. Returns null if unavailable or on error. */
export async function readTextFileTail(
  path: string,
  maxBytes: number,
): Promise<string | null> {
  if (!isDesktopApp() || !path.trim()) return null
  try {
    return await invoke<string>('read_text_file_tail', {
      path: path.trim(),
      maxBytes: Math.max(1, Math.floor(maxBytes)),
    })
  } catch {
    return null
  }
}

/** Write UTF-8 text to an absolute path (creates parents). */
export async function writeTextFileAt(
  path: string,
  contents: string,
): Promise<void> {
  if (!isDesktopApp()) return
  await invoke('write_text_file', { path: path.trim(), contents })
}

/** Append UTF-8 text to an absolute path (creates parents and the file). */
export async function appendTextFileAt(
  path: string,
  contents: string,
): Promise<void> {
  if (!isDesktopApp()) return
  await invoke('append_text_file', { path: path.trim(), contents })
}

/** Create directory and parents if missing. */
export async function ensureDir(path: string): Promise<void> {
  if (!isDesktopApp() || !path.trim()) return
  await invoke('ensure_dir', { path: path.trim() })
}

/**
 * Validate a folder path that may not exist yet: if missing, its parent must
 * already be a directory. Existing paths must be directories.
 */
export async function validateCreatableDir(path: string): Promise<void> {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('Required')
  if (!isDesktopApp()) return
  await invoke('validate_creatable_dir', { path: trimmed })
}

/** True when the game folder contains WeiDU.log (likely already modded). */
export async function gameDirHasWeiduLog(gameDir: string): Promise<boolean> {
  if (!isDesktopApp() || !gameDir.trim()) return false
  try {
    return await invoke<boolean>('game_dir_has_weidu_log', {
      gameDir: gameDir.trim(),
    })
  } catch {
    return false
  }
}

/** True when the path does not exist or is an empty directory. */
export async function dirIsEmpty(path: string): Promise<boolean> {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('Required')
  if (!isDesktopApp()) return true
  return invoke<boolean>('dir_is_empty', { path: trimmed })
}

/** Normalize a folder path for equality checks (trim, strip trailing separators, case-fold). */
export function normalizeFolderPath(path: string): string {
  const trimmed = path.trim().replace(/[/\\]+$/, '')
  return trimmed.toLowerCase()
}
