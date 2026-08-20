import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { isDesktopApp } from './fsDialogs'

/** Open a folder in the system file manager. */
export async function openFolderPath(path: string): Promise<void> {
  const trimmed = path.trim()
  if (!trimmed || !isDesktopApp()) return
  await openPath(trimmed)
}

/**
 * Reveal a file in its parent folder (Explorer / Finder).
 * Falls back to opening the parent directory when reveal fails.
 */
export async function revealFileInDir(path: string): Promise<void> {
  const trimmed = path.trim()
  if (!trimmed || !isDesktopApp()) return
  try {
    await revealItemInDir(trimmed)
  } catch {
    const parent = trimmed.replace(/[/\\][^/\\]+$/, '')
    if (parent) await openPath(parent)
  }
}

/** Open the install run log folder, highlighting run-stdout.log when possible. */
export async function openInstallLogFolder(logDir: string): Promise<void> {
  const trimmed = logDir.trim()
  if (!trimmed || !isDesktopApp()) return
  const stdoutLog = `${trimmed.replace(/[/\\]+$/, '')}/run-stdout.log`
  try {
    await revealItemInDir(stdoutLog)
  } catch {
    await openPath(trimmed)
  }
}
