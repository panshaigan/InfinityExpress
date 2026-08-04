import type { StationId } from '../xml/schema'

export type StationSlot = 'engine' | StationId

export type ChromeCommand =
  | { type: 'cycleStation'; direction: -1 | 1 }
  | { type: 'cycleContentMain'; direction: -1 | 1 }
  | { type: 'cycleContentSub'; direction: -1 | 1 }
  | { type: 'focusSearch' }
  | { type: 'escapeChrome' }

export interface ChromeHotkeyContext {
  /** True when the event target is a text field the user is typing into. */
  isTypingTarget: boolean
  /** True when a filter disclosure panel is open. */
  filterPanelOpen: boolean
  /** True when the filter search input currently has DOM focus. */
  searchFocused: boolean
  /** True when the Content station is active (enables ,/. branch cycling). */
  contentStationActive: boolean
  /** Shift modifier — used with ,/. when the key value is unchanged. */
  shiftKey: boolean
}

/** Tag names that count as typing targets for chrome hotkey suppression. */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const el = target.closest('input, textarea, select')
  if (!el) return false
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase()
    // Allow non-text inputs (checkbox, radio, range, button) to receive chrome keys.
    if (
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'range' ||
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'file'
    ) {
      return false
    }
  }
  return TYPING_TAGS.has(el.tagName)
}

/**
 * Build ordered station slots: Engine first, then visible content stations.
 */
export function stationCycleOrder(visibleStations: readonly StationId[]): StationSlot[] {
  return ['engine', ...visibleStations]
}

/** Next/previous station with wrap-around. */
export function cycleStation(
  order: readonly StationSlot[],
  active: StationSlot,
  direction: -1 | 1,
): StationSlot | null {
  if (order.length === 0) return null
  const idx = order.indexOf(active)
  const from = idx >= 0 ? idx : 0
  const next = (from + direction + order.length) % order.length
  return order[next] ?? null
}

/**
 * Resolve an app-chrome key. Returns null when not handled.
 * `/` is allowed even while typing so users can jump to search from elsewhere;
 * when already in a typing field other than via intentional focusSearch, `[`/`]` are suppressed.
 */
export function resolveChromeHotkey(
  key: string,
  ctx: ChromeHotkeyContext,
): ChromeCommand | null {
  if (key === '/') {
    // Already in search — let the character through.
    if (ctx.searchFocused) return null
    return { type: 'focusSearch' }
  }

  if (key === 'Escape') {
    if (ctx.filterPanelOpen || ctx.searchFocused) {
      return { type: 'escapeChrome' }
    }
    return null
  }

  if (ctx.isTypingTarget) return null

  if (key === '[') return { type: 'cycleStation', direction: -1 }
  if (key === ']') return { type: 'cycleStation', direction: 1 }

  if (ctx.contentStationActive) {
    // US layout: Shift+, → '<', Shift+. → '>'. Some layouts keep ',' / '.' with shiftKey.
    if (key === '<' || (key === ',' && ctx.shiftKey)) {
      return { type: 'cycleContentSub', direction: -1 }
    }
    if (key === '>' || (key === '.' && ctx.shiftKey)) {
      return { type: 'cycleContentSub', direction: 1 }
    }
    if (key === ',') return { type: 'cycleContentMain', direction: -1 }
    if (key === '.') return { type: 'cycleContentMain', direction: 1 }
  }

  return null
}

/** Next tab index within a tablist (wrap). Pure helper for ContentBranchNav. */
export function cycleTabIndex(
  count: number,
  currentIndex: number,
  direction: -1 | 1,
): number {
  if (count <= 0) return 0
  const from = currentIndex >= 0 ? currentIndex : 0
  return (from + direction + count) % count
}
