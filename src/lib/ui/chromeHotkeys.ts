import type { StationId } from '../xml/schema'

export type StationSlot = 'engine' | 'presets' | StationId

/** Setup stops with no component tree (Presets). */
export function isSetupSlot(slot: StationSlot | string): slot is 'engine' | 'presets' {
  return slot === 'engine' || slot === 'presets'
}

export type ChromeCommand =
  | { type: 'cycleStation'; direction: -1 | 1 }
  | { type: 'cycleBranchMain'; direction: -1 | 1 }
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
  /** True when Content or Mechanics is active (enables ,/. main branch cycling). */
  branchMainCycleActive: boolean
  /** True when Content is active (enables </> subbranch cycling). */
  contentSubCycleActive: boolean
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

/** True when no interactive element has DOM focus (body / html / null). */
export function isDocumentShellFocused(el: Element | null): boolean {
  if (el == null) return true
  return el === document.body || el === document.documentElement
}

/**
 * Build ordered station slots: Presets, then visible content stations.
 * (`engine` remains a valid StationSlot for legacy session data only.)
 */
export function stationCycleOrder(visibleStations: readonly StationId[]): StationSlot[] {
  return ['presets', ...visibleStations]
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

  if (ctx.contentSubCycleActive) {
    // US layout: Shift+, → '<', Shift+. → '>'. Some layouts keep ',' / '.' with shiftKey.
    if (key === '<' || (key === ',' && ctx.shiftKey)) {
      return { type: 'cycleContentSub', direction: -1 }
    }
    if (key === '>' || (key === '.' && ctx.shiftKey)) {
      return { type: 'cycleContentSub', direction: 1 }
    }
  }

  if (ctx.branchMainCycleActive) {
    if (key === ',') return { type: 'cycleBranchMain', direction: -1 }
    if (key === '.') return { type: 'cycleBranchMain', direction: 1 }
  }

  return null
}

/** Next tab index within a tablist/listbox (wrap). Pure helper for branch menus. */
export function cycleTabIndex(
  count: number,
  currentIndex: number,
  direction: -1 | 1,
): number {
  if (count <= 0) return 0
  const from = currentIndex >= 0 ? currentIndex : 0
  return (from + direction + count) % count
}
