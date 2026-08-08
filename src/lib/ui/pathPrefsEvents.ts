/** Fired after game-folder or app-dir prefs are written so open UIs can re-sync. */
export const PATHS_CHANGED_EVENT = 'ie-paths-changed'

export function notifyPathsChanged(): void {
  queueMicrotask(() => {
    window.dispatchEvent(new Event(PATHS_CHANGED_EVENT))
  })
}
