import { invoke, isTauri } from '@tauri-apps/api/core'

export type SystemSoundKind = 'success' | 'error'

/** Best-effort OS system sound (Windows aliases). No-op outside Tauri. */
export async function playSystemSound(kind: SystemSoundKind): Promise<void> {
  if (!isTauri()) return
  try {
    await invoke('play_system_sound', { kind })
  } catch {
    // Ignore — announce is optional.
  }
}
