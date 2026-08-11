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
