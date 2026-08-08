import { useEffect, useMemo, useState } from 'react'
import type { SelectedGame, StationId } from '../lib/xml/schema'
import type { StationSlot } from '../lib/ui/chromeHotkeys'
import { cycleScreen, type NavScreen } from '../lib/ui/screenCycle'
import type { AppNavSlot } from '../ui/StationNav'

export function useRouteNav(args: {
  game: SelectedGame | null
  activeStation: AppNavSlot
  setActiveStation: (slot: AppNavSlot) => void
  visibleStations: StationId[]
  navigableScreens: NavScreen[]
  contentMainKey: string | null
  contentSubKey: string | null
  contentSubTag: string | null
  setContentMainKey: (key: string | null) => void
  setContentSubKey: (key: string | null) => void
  setContentSubTag: (tag: string | null) => void
  clearFocus: () => void
  showRouteTip: boolean
  dismissRouteTip: () => void
}) {
  const {
    game,
    activeStation,
    setActiveStation,
    visibleStations,
    navigableScreens,
    contentMainKey,
    contentSubKey,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
    clearFocus,
    showRouteTip,
    dismissRouteTip,
  } = args

  const [finishedStations, setFinishedStations] = useState<Set<StationSlot>>(
    () => new Set(),
  )
  const [hideCaughtUp, setHideCaughtUp] = useState(false)

  const routeProgress = useMemo(() => {
    const slots: StationSlot[] = ['engine', ...visibleStations]
    const finishedCount = slots.filter((id) => finishedStations.has(id)).length
    return { finishedCount, totalCount: slots.length }
  }, [finishedStations, visibleStations])

  const routeComplete =
    !!game &&
    routeProgress.totalCount > 0 &&
    routeProgress.finishedCount === routeProgress.totalCount

  useEffect(() => {
    if (!routeComplete) setHideCaughtUp(false)
  }, [routeComplete])

  const currentFinished = finishedStations.has(activeStation)

  const currentNavScreen = useMemo((): NavScreen | null => {
    if (activeStation === 'engine' || !game) return null
    if (activeStation === 'content') {
      if (contentMainKey == null || contentSubKey == null) return null
      return {
        stationId: 'content',
        mainKey: contentMainKey,
        subKey: contentSubKey,
        subTag: contentSubTag ?? '',
      }
    }
    return { stationId: activeStation }
  }, [activeStation, contentMainKey, contentSubKey, contentSubTag, game])

  const canCycleScreens =
    !!game && navigableScreens.some((s) => !finishedStations.has(s.stationId))

  const canMarkFinished = activeStation === 'engine' ? !!game : true

  function applyNavScreen(screen: NavScreen) {
    setActiveStation(screen.stationId)
    if (screen.stationId === 'content') {
      setContentMainKey(screen.mainKey)
      setContentSubKey(screen.subKey)
      setContentSubTag(screen.subTag)
    }
    clearFocus()
  }

  function skipFinishedScreen(screen: NavScreen): boolean {
    return finishedStations.has(screen.stationId)
  }

  function goPrevScreen() {
    const next = cycleScreen(
      navigableScreens,
      currentNavScreen,
      -1,
      skipFinishedScreen,
    )
    if (next) applyNavScreen(next)
  }

  function goNextScreen() {
    const next = cycleScreen(
      navigableScreens,
      currentNavScreen,
      1,
      skipFinishedScreen,
    )
    if (next) applyNavScreen(next)
  }

  function markStationFinished(slot: StationSlot = activeStation) {
    setFinishedStations((prev) => {
      const next = new Set(prev)
      next.add(slot)
      return next
    })
  }

  function unmarkStationFinished() {
    setFinishedStations((prev) => {
      if (!prev.has(activeStation)) return prev
      const next = new Set(prev)
      next.delete(activeStation)
      return next
    })
  }

  /** Mark current station finished, then advance past it to the next unfinished screen. */
  function onOk() {
    if (!canMarkFinished) return
    if (showRouteTip) dismissRouteTip()
    markStationFinished()
    const next = cycleScreen(
      navigableScreens,
      currentNavScreen,
      1,
      (s) => finishedStations.has(s.stationId) || s.stationId === activeStation,
    )
    if (next) applyNavScreen(next)
  }

  function resetFinishedStations() {
    setFinishedStations(new Set())
  }

  return {
    finishedStations,
    hideCaughtUp,
    setHideCaughtUp,
    routeProgress,
    routeComplete,
    currentFinished,
    canCycleScreens,
    canMarkFinished,
    goPrevScreen,
    goNextScreen,
    onOk,
    markStationFinished,
    unmarkStationFinished,
    resetFinishedStations,
  }
}
