import type { GameFolderKey } from '../ui/gameFolderPrefs'
import { gameDirHasWeiduLog, isDesktopApp } from './fsDialogs'
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
  opts?: { rejectWeiduLog?: boolean },
): Promise<ProbeGameFolderResult> {
  const trimmed = path.trim()
  if (!trimmed) {
    return { ok: false, error: 'Required' }
  }
  if (!isDesktopApp()) {
    // Browser preview: accept path without exe probe.
    return { ok: true, version: '' }
  }
  const exeName = GAME_FOLDER_EXE[key]
  const rejectWeiduLog = opts?.rejectWeiduLog !== false
  try {
    const version = await readGameExeVersion(trimmed, exeName)
    if (rejectWeiduLog && (await gameDirHasWeiduLog(trimmed))) {
      return {
        ok: false,
        error: 'Folder looks modded (WeiDU.log found)',
      }
    }
    return { ok: true, version }
  } catch {
    return {
      ok: false,
      error: `Not a valid game folder (missing ${exeName})`,
    }
  }
}
