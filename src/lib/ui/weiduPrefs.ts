import { notifyPathsChanged } from './pathPrefsEvents'

const STORAGE_KEY = 'infinity-express.weidu-path'

export function readWeiduPath(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function writeWeiduPath(path: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, path.trim())
    notifyPathsChanged()
  } catch {
    /* private mode / blocked storage */
  }
}
