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
import { isDesktopApp } from '../lib/desktop/fsDialogs'
import { FILTERS_SEARCH_ID } from '../ui/FiltersStrip'
import { MODS_SEARCH_ID } from '../ui/mods/ModsToolbar'
import type { AppNavSlot } from '../ui/StationNav'

const SEARCH_IDS = [FILTERS_SEARCH_ID, MODS_SEARCH_ID] as const

function findSearchInput(): HTMLInputElement | null {
  for (const id of SEARCH_IDS) {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el) return el
  }
  return null
}

export function useChromeHotkeys(args: {
  keyboardHelpOpen: boolean
  showDetail: boolean
  activeStation: AppNavSlot
  visibleStations: StationId[]
  mainBranches: DisplayNode[]
  subBranches: DisplayNode[]
  mainKey: string | null
  subKey: string | null
  branchMainCycleActive: boolean
  contentSubCycleActive: boolean
  onToggleRailCollapsed: () => void
  onToggleDetailCollapsed: () => void
  onOpenKeyboardHelp: () => void
  onSelectMain: (key: string) => void
  onSelectSub: (key: string) => void
  onApplyStationSlot: (slot: StationSlot) => void
  onFocusMainDisplay: () => void
}) {
  const {
    keyboardHelpOpen,
    showDetail,
    activeStation,
    visibleStations,
    mainBranches,
    subBranches,
    mainKey,
    subKey,
    branchMainCycleActive,
    contentSubCycleActive,
    onToggleRailCollapsed,
    onToggleDetailCollapsed,
    onOpenKeyboardHelp,
    onSelectMain,
    onSelectSub,
    onApplyStationSlot,
    onFocusMainDisplay,
  } = args

  useEffect(() => {
    function focusAppSearch() {
      const el = findSearchInput()
      if (!el) return
      el.focus()
      el.select()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (
        isDesktopApp() &&
        !keyboardHelpOpen &&
        (e.key === 'F3' || e.key === 'F6')
      ) {
        e.preventDefault()
        if (e.key === 'F3') focusAppSearch()
        else onFocusMainDisplay()
        return
      }
      if (!keyboardHelpOpen && e.key === 'F1') {
        e.preventDefault()
        onOpenKeyboardHelp()
        return
      }
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
      const searchEl = findSearchInput()
      const cmd = resolveChromeHotkey(e.key, {
        isTypingTarget: isTypingTarget(e.target),
        filterPanelOpen: false,
        searchFocused: searchEl != null && document.activeElement === searchEl,
        branchMainCycleActive,
        contentSubCycleActive,
        shiftKey: e.shiftKey,
      })
      if (!cmd) return
      if (cmd.type === 'escapeChrome') return

      if (cmd.type === 'focusSearch') {
        e.preventDefault()
        focusAppSearch()
        return
      }

      if (cmd.type === 'cycleStation') {
        e.preventDefault()
        const order = stationCycleOrder(visibleStations)
        const next = cycleStation(order, activeStation, cmd.direction)
        if (next) onApplyStationSlot(next)
        return
      }

      if (cmd.type === 'cycleBranchMain') {
        if (mainBranches.length === 0) return
        e.preventDefault()
        const keys = mainBranches.map((b) => b.node.key)
        const currentIndex = mainKey != null ? keys.indexOf(mainKey) : 0
        const next = cycleTabIndex(keys.length, currentIndex, cmd.direction)
        const nextKey = keys[next]
        if (nextKey) onSelectMain(nextKey)
        return
      }

      if (cmd.type === 'cycleContentSub') {
        if (subBranches.length === 0) return
        e.preventDefault()
        const keys = subBranches.map((b) => b.node.key)
        const currentIndex = subKey != null ? keys.indexOf(subKey) : 0
        const next = cycleTabIndex(keys.length, currentIndex, cmd.direction)
        const nextKey = keys[next]
        if (nextKey) onSelectSub(nextKey)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeStation,
    keyboardHelpOpen,
    showDetail,
    visibleStations,
    mainBranches,
    subBranches,
    mainKey,
    subKey,
    branchMainCycleActive,
    contentSubCycleActive,
    onToggleRailCollapsed,
    onToggleDetailCollapsed,
    onOpenKeyboardHelp,
    onSelectMain,
    onSelectSub,
    onApplyStationSlot,
    onFocusMainDisplay,
  ])
}
