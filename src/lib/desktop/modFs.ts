import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from './fsDialogs'

/** List immediate subdirectory names under `path`. Browser / unset → []. */
export async function listSubdirNames(path: string): Promise<string[]> {
  const trimmed = path.trim()
  if (!trimmed || !isDesktopApp()) return []
  return invoke<string[]>('list_subdir_names', { path: trimmed })
}

/**
 * Recursively delete `downloadDir/folderName`.
 * No-op (resolves) when not in the desktop app.
 */
export async function removeModDir(
  downloadDir: string,
  folderName: string,
): Promise<void> {
  if (!isDesktopApp()) return
  await invoke('remove_mod_dir', {
    downloadDir: downloadDir.trim(),
    folderName: folderName.trim(),
  })
}
