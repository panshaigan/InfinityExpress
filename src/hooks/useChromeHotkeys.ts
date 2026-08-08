import { useEffect } from 'react'
import type { DisplayNode } from '../lib/selection/visibility'
import type { StationId } from '../lib/xml/schema'
import {
  cycleStation,
  cycleTabIndex,
  isDocumentShellFocused,
  isTypingTarget,
  resolveChromeHotkey,
  stationCycleOrder,
  type StationSlot,
} from '../lib/ui/chromeHotkeys'
import { FILTERS_SEARCH_ID } from '../ui/FiltersStrip'
import type { AppNavSlot } from '../ui/StationNav'

export function useChromeHotkeys(args: {
  keyboardHelpOpen: boolean
  showDetail: boolean
  activeStation: AppNavSlot
  visibleStations: StationId[]
  contentMainBranches: DisplayNode[]
  contentSubBranches: DisplayNode[]
  contentMainKey: string | null
  contentSubKey: string | null
  onToggleRailCollapsed: () => void
  onToggleDetailCollapsed: () => void
  onOpenKeyboardHelp: () => void
  onSelectContentMain: (key: string) => void
  onSelectContentSub: (key: string) => void
  onApplyStationSlot: (slot: StationSlot) => void
  onFocusMainDisplay: () => void
}) {
  const {
    keyboardHelpOpen,
    showDetail,
    activeStation,
    visibleStations,
    contentMainBranches,
    contentSubBranches,
    contentMainKey,
    contentSubKey,
    onToggleRailCollapsed,
    onToggleDetailCollapsed,
    onOpenKeyboardHelp,
    onSelectContentMain,
    onSelectContentSub,
    onApplyStationSlot,
    onFocusMainDisplay,
  } = args

  useEffect(() => {
    function focusFiltersSearch() {
      const el = document.getElementById(FILTERS_SEARCH_ID) as HTMLInputElement | null
      if (!el) return
      el.focus()
      el.select()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (
        !keyboardHelpOpen &&
        !isTypingTarget(e.target) &&
        e.key === 'Tab' &&
        !e.shiftKey &&
        isDocumentShellFocused(document.activeElement)
      ) {
        e.preventDefault()
        onFocusMainDisplay()
        return
      }
      if (
        !isTypingTarget(e.target) &&
        !keyboardHelpOpen &&
        e.key === '\\'
      ) {
        e.preventDefault()
        onToggleRailCollapsed()
        return
      }
      if (
        !isTypingTarget(e.target) &&
        !keyboardHelpOpen &&
        e.key === ';' &&
        showDetail
      ) {
        e.preventDefault()
        onToggleDetailCollapsed()
        return
      }
      if (
        !isTypingTarget(e.target) &&
        !keyboardHelpOpen &&
        (e.key === '?' || (e.shiftKey && e.key === '/'))
      ) {
        e.preventDefault()
        onOpenKeyboardHelp()
        return
      }
      const searchEl = document.getElementById(FILTERS_SEARCH_ID)
      const cmd = resolveChromeHotkey(e.key, {
        isTypingTarget: isTypingTarget(e.target),
        filterPanelOpen: false,
        searchFocused: searchEl != null && document.activeElement === searchEl,
        contentStationActive: activeStation === 'content',
        shiftKey: e.shiftKey,
      })
      if (!cmd) return
      if (cmd.type === 'escapeChrome') return

      if (cmd.type === 'focusSearch') {
        e.preventDefault()
        focusFiltersSearch()
        return
      }

      if (cmd.type === 'cycleStation') {
        e.preventDefault()
        const order = stationCycleOrder(visibleStations)
        const next = cycleStation(order, activeStation, cmd.direction)
        if (next) onApplyStationSlot(next)
        return
      }

      if (cmd.type === 'cycleContentMain') {
        if (contentMainBranches.length === 0) return
        e.preventDefault()
        const keys = contentMainBranches.map((b) => b.node.key)
        const currentIndex = contentMainKey != null ? keys.indexOf(contentMainKey) : 0
        const next = cycleTabIndex(keys.length, currentIndex, cmd.direction)
        const nextKey = keys[next]
        if (nextKey) onSelectContentMain(nextKey)
        return
      }

      if (cmd.type === 'cycleContentSub') {
        if (contentSubBranches.length === 0) return
        e.preventDefault()
        const keys = contentSubBranches.map((b) => b.node.key)
        const currentIndex = contentSubKey != null ? keys.indexOf(contentSubKey) : 0
        const next = cycleTabIndex(keys.length, currentIndex, cmd.direction)
        const nextKey = keys[next]
        if (nextKey) onSelectContentSub(nextKey)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeStation,
    keyboardHelpOpen,
    showDetail,
    visibleStations,
    contentMainBranches,
    contentSubBranches,
    contentMainKey,
    contentSubKey,
    onToggleRailCollapsed,
    onToggleDetailCollapsed,
    onOpenKeyboardHelp,
    onSelectContentMain,
    onSelectContentSub,
    onApplyStationSlot,
    onFocusMainDisplay,
  ])
}
