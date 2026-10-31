import { invoke } from '@tauri-apps/api/core'
import type { GameFolderKey } from '../ui/gameFolderPrefs'
import { isDesktopApp } from './fsDialogs'
import { openFolderPath } from './openPath'

export async function openGameDocuments(gamePath: string): Promise<void> {
  if (!isDesktopApp()) return
  const path = await invoke<string>('game_documents_path', { gamePath })
  await openFolderPath(path)
}

export async function launchProjectGame(gamePath: string, gameKey: GameFolderKey): Promise<void> {
  if (!isDesktopApp()) return
  await invoke('launch_project_game', { gamePath, gameKey })
}
