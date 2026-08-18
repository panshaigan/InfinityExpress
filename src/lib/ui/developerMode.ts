export const DEVELOPER_MODE_STORAGE_KEY = 'infinity-express.developer-mode'

export function readDeveloperMode(): boolean {
  try {
    return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDeveloperMode(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      DEVELOPER_MODE_STORAGE_KEY,
      enabled ? '1' : '0',
    )
  } catch {
    /* private mode / blocked storage */
  }
}
