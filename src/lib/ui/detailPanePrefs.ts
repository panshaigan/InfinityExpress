const DETAIL_STORAGE_KEY = 'infinity-express.detail-collapsed'

export function readDetailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(DETAIL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDetailCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(DETAIL_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode / blocked storage */
  }
}
