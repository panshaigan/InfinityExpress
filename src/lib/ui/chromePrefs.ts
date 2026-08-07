const RAIL_STORAGE_KEY = 'infinity-express.rail-collapsed'
const ROUTE_TIP_STORAGE_KEY = 'infinity-express.route-tip-dismissed'

export function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeRailCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode / blocked storage */
  }
}

export function readRouteTipDismissed(): boolean {
  try {
    return window.localStorage.getItem(ROUTE_TIP_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeRouteTipDismissed(): void {
  try {
    window.localStorage.setItem(ROUTE_TIP_STORAGE_KEY, '1')
  } catch {
    /* private mode / blocked storage */
  }
}
