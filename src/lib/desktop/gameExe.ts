import type { GameFolderKey } from '../ui/gameFolderPrefs'
import { isDesktopApp } from './fsDialogs'
import { readGameExeVersion } from './weiduInstall'

export const GAME_FOLDER_EXE: Record<GameFolderKey, string> = {
  bg1: 'Baldur.exe',
  bg2: 'Baldur.exe',
  iwd: 'Icewind.exe',
  pst: 'Torment.exe',
}

export type ProbeGameFolderResult =
  | { ok: true; version: string }
  | { ok: false; error: string }

export async function probeGameFolder(
  key: GameFolderKey,
  path: string,
): Promise<ProbeGameFolderResult> {
  const trimmed = path.trim()
  if (!trimmed) {
    return { ok: false, error: 'Not a valid game folder' }
  }
  if (!isDesktopApp()) {
    // Browser preview: accept path without exe probe.
    return { ok: true, version: '' }
  }
  const exeName = GAME_FOLDER_EXE[key]
  try {
    const version = await readGameExeVersion(trimmed, exeName)
    return { ok: true, version }
  } catch {
    return {
      ok: false,
      error: `Not a valid game folder (missing ${exeName})`,
    }
  }
}
