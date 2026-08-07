const DETAIL_COLLAPSED_KEY = 'infinity-express.detail-collapsed'
const DETAIL_WIDTH_KEY = 'infinity-express.detail-width'

export const DETAIL_WIDTH_DEFAULT = 340
export const DETAIL_WIDTH_MIN = 240
export const DETAIL_WIDTH_MAX = 520

export function readDetailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(DETAIL_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDetailCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(DETAIL_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode / blocked storage */
  }
}

export function clampDetailWidth(width: number): number {
  return Math.min(DETAIL_WIDTH_MAX, Math.max(DETAIL_WIDTH_MIN, Math.round(width)))
}

export function readDetailWidth(): number {
  try {
    const raw = window.localStorage.getItem(DETAIL_WIDTH_KEY)
    if (raw == null) return DETAIL_WIDTH_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return DETAIL_WIDTH_DEFAULT
    return clampDetailWidth(n)
  } catch {
    return DETAIL_WIDTH_DEFAULT
  }
}

export function writeDetailWidth(width: number): void {
  try {
    window.localStorage.setItem(DETAIL_WIDTH_KEY, String(clampDetailWidth(width)))
  } catch {
    /* private mode / blocked storage */
  }
}
