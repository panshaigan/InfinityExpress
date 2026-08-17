import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import installSequenceXml from './data/InstallSequence.xml?raw'
import { parseInstallSequence } from './lib/xml/parseInstallSequence'
import {
  STATION_LABELS,
  isComponentNode,
  type SelectedGame,
  type StationId,
} from './lib/xml/schema'
import {
  createInitialSelection,
  listSelectionState,
  randomizeDisplaySubtree,
  toggleDisplayNode,
  toggleListSelection,
  type RandomizeOptions,
} from './lib/selection/selectionEngine'
import { buildPresetTilePreview } from './lib/selection/presetPreview'
import {
  buildRecommendedCatalog,
  countAllRecommendedContent,
} from './lib/recommended/catalog'
import { type DisplayNode } from './lib/selection/visibility'
import {
  collectFilterOptions,
  createDefaultFilterCriteria,
  isFilterActive,
  type FilterCriteria,
} from './lib/selection/filterDisplayTree'
import {
  catalogAuthorOptions,
  filterSeed,
  modsByCodename,
} from './lib/mods/catalog'
import { buildRelationIndex } from './lib/selection/relations'
import {
  deriveInstallLock,
  isComponentSelectionLocked,
  canRemoveStepFromPlan,
  type InstallLock,
} from './lib/install/installLock'
import { isSetupSlot, type StationSlot } from './lib/ui/chromeHotkeys'
import {
  readDetailCollapsed,
  writeDetailCollapsed,
  readDetailWidth,
} from './lib/ui/detailPanePrefs'
import {
  readRailCollapsed,
  writeRailCollapsed,
  readRouteTipDismissed,
  writeRouteTipDismissed,
} from './lib/ui/chromePrefs'
import { listEmptyCopy } from './lib/ui/listEmptyCopy'
import { StationNav, type AppNavSlot } from './ui/StationNav'
import { PresetsStation } from './ui/PresetsStation'
import { ProjectHub } from './ui/projects/ProjectHub'
import { ProjectWizard } from './ui/projects/ProjectWizard'
import { ScreenNavButtons } from './ui/ScreenNavButtons'
import { ComponentTree, type TreeFoldApi } from './ui/ComponentTree'
import { StationBranchNav } from './ui/StationBranchNav'
import { StationListToolbar } from './ui/StationListToolbar'
import { StationPresetsMenu } from './ui/StationPresetsMenu'
import { GlobalSearchList } from './ui/GlobalSearchList'
import { GlobalSearchToolbar } from './ui/GlobalSearchToolbar'
import { FiltersStrip } from './ui/FiltersStrip'
import { AboutDialog } from './ui/AboutDialog'
import { KeyboardHelp } from './ui/KeyboardHelp'
import { RouteGuideTip } from './ui/RouteGuideTip'
import { RouteCaughtUp } from './ui/RouteCaughtUp'
import { SettingsDialog } from './ui/SettingsDialog'
import { ExportDialog } from './ui/ExportDialog'
import { ModsCsvExportDialog } from './ui/ModsCsvExportDialog'
import {
  WeiduLogExportDialog,
  hasAnyWeiduLog,
} from './ui/WeiduLogExportDialog'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { PresetLoadNotice } from './ui/PresetLoadNotice'
import { AppTopBar } from './ui/AppTopBar'
import { PresetDetail } from './ui/PresetDetail'
import { DetailPane } from './ui/DetailPane'
import { listSelectedModCodenames } from './lib/mods/loadMods'
import { useStationTrees } from './hooks/useStationTrees'
import { useBranchNav } from './hooks/useBranchNav'
import { useSelectionPresetsState } from './hooks/useSelectionPresetsState'
import { useLevelPresets } from './hooks/useLevelPresets'
import { useRecommendedPresets } from './hooks/useRecommendedPresets'
import { useChromeHotkeys } from './hooks/useChromeHotkeys'
import { useRouteNav } from './hooks/useRouteNav'
import { usePresetTileFocus } from './hooks/usePresetTileFocus'
import { useTreeFocus } from './hooks/useTreeFocus'
import { useUserCatalog } from './hooks/useUserCatalog'
import { useProjectSessionPersistence } from './hooks/useProjectSessionPersistence'
import { useAppExitGuard } from './hooks/useAppExitGuard'
import { type AppPhase } from './ui/PhaseNav'
import { ModsStation, type ModsJourneyState } from './ui/mods/ModsStation'
import { InstallStation, type InstallActions } from './ui/install/InstallStation'
import {
  RestartConfirmDialog,
  type RestartScope,
} from './ui/install/RestartConfirmDialog'
import { ToastProvider, useToast } from './ui/toasts/toastContext'
import { isDesktopApp } from './lib/desktop/fsDialogs'
import { setAppWindowTitle } from './lib/desktop/windowTitle'
import {
  defaultSettingsTabForContext,
  firstMissingFocusField,
  getMissingInstallPaths,
  type MissingInstallPath,
  type SettingsFocusField,
} from './lib/ui/installPathValidation'
import {
  buildGameSessionSnapshot,
  levelPresetsInitialFromSession,
  recommendedPresetsInitialFromSession,
  sanitizeInstallSession,
  type PersistedInstallSession,
} from './lib/ui/appSessionPrefs'
import {
  EMPTY_BLOCKING_FLAGS,
  exitConfirmCopy,
  isAppBlocking,
  projectsBlockedTip,
  type AppBlockingFlags,
} from './lib/ui/appBlockingOperations'
import type { GameFolderPaths } from './lib/ui/gameFolderPrefs'
import {
  bootstrapProjects,
  emptyDestinations,
  listProjects,
  loadProjectRecord,
  updateProjectMeta,
  type AppShellView,
  type ProjectId,
  type ProjectMeta,
} from './lib/projects'
import './index.css'

const parsed = parseInstallSequence(installSequenceXml)
const projectBootstrap = bootstrapProjects(parsed.model)

function normalizeStation(slot: AppNavSlot): Exclude<AppNavSlot, 'engine'> {
  return slot === 'engine' ? 'presets' : slot
}

function componentIdsInDisplay(display: DisplayNode): string[] {
  if (display.collapsedComponent) return [display.collapsedComponent.componentId]
  if (isComponentNode(display.node)) return [display.node.componentId]
  return display.children.flatMap((child) => componentIdsInDisplay(child))
}

function isDisplaySelectionLocked(
  display: DisplayNode,
  lock: InstallLock,
  model: typeof parsed.model,
  relationIndex: ReturnType<typeof buildRelationIndex>,
): boolean {
  return componentIdsInDisplay(display).some((id) =>
    isComponentSelectionLocked(id, lock, model, relationIndex),
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  )
}

function AppShell() {
  const { pushToast } = useToast()
  const { model, warnings } = parsed
  const relationIndex = useMemo(() => buildRelationIndex(model), [model])
  const installSnapshotRef = useRef<PersistedInstallSession | null | undefined>(
    undefined,
  )
  const [shellView, setShellView] = useState<AppShellView>(
    () => projectBootstrap.view,
  )
  const [projectId, setProjectId] = useState<ProjectId | null>(null)
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null)
  const [gameFolders, setGameFolders] = useState<GameFolderPaths>(emptyDestinations)
  const [restoredInstallSession, setRestoredInstallSession] = useState<
    PersistedInstallSession | undefined
  >(undefined)
  const [installSession, setInstallSession] = useState<
    PersistedInstallSession | null | undefined
  >(undefined)
  const installLock = useMemo(
    () => deriveInstallLock(installSession?.run ?? null, installSession?.transport),
    [installSession],
  )
  const selectionLockedIds = useMemo(() => {
    if (installLock.mode === 'none') return null
    const locked = new Set<string>()
    for (const c of model.componentsInOrder) {
      if (isComponentSelectionLocked(c.componentId, installLock, model, relationIndex)) {
        locked.add(c.componentId)
      }
    }
    return locked
  }, [installLock, model, relationIndex])
  const installSelectionFrozen = installLock.mode !== 'none'
  const installWorking = installLock.mode === 'working'
  const routeReopenDisabled = installWorking
  const [game, setGame] = useState<SelectedGame | null>(null)
  const [routeUnlocked, setRouteUnlocked] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [activeStation, setActiveStation] = useState<AppNavSlot>('presets')
  const [appPhase, setAppPhase] = useState<AppPhase>('components')
  const [mountedPhases, setMountedPhases] = useState<Record<AppPhase, boolean>>(() => ({
    components: true,
    mods: false,
    install: false,
  }))
  const [phaseBusy, setPhaseBusy] = useState<Partial<Record<AppPhase, boolean>>>({})
  const [blockingFlags, setBlockingFlags] =
    useState<AppBlockingFlags>(EMPTY_BLOCKING_FLAGS)
  const [modsJourney, setModsJourney] = useState<ModsJourneyState | null>(null)
  const [searchScope, setSearchScope] = useState<'section' | 'all'>('section')
  const userCatalog = useUserCatalog()

  const filterOptions = useMemo(() => collectFilterOptions(model), [model])
  const [filters, setFilters] = useState<FilterCriteria>(() =>
    createDefaultFilterCriteria(
      collectFilterOptions(parsed.model).tags,
      filterSeed,
    ),
  )
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsFocusField, setSettingsFocusField] = useState<
    SettingsFocusField | null
  >(null)
  const [settingsHighlightMissing, setSettingsHighlightMissing] = useState<
    MissingInstallPath[]
  >([])
  const [showRouteTip, setShowRouteTip] = useState(() => !readRouteTipDismissed())
  const [railCollapsed, setRailCollapsed] = useState(() => readRailCollapsed())
  const [detailCollapsed, setDetailCollapsed] = useState(() => readDetailCollapsed())
  const [detailWidth, setDetailWidth] = useState(() => readDetailWidth())
  const [exportOpen, setExportOpen] = useState(false)
  const [csvExportOpen, setCsvExportOpen] = useState(false)
  const [weiduExportOpen, setWeiduExportOpen] = useState(false)
  const [resetAllConfirmOpen, setResetAllConfirmOpen] = useState(false)
  const [resetAllRestartOpen, setResetAllRestartOpen] = useState(false)
  const [pendingVanillaRestartScope, setPendingVanillaRestartScope] =
    useState<RestartScope | null>(null)
  const [installActions, setInstallActions] = useState<InstallActions | null>(null)
  const foldApiRef = useRef<TreeFoldApi | null>(null)
  const onFoldApiReady = useCallback((api: TreeFoldApi | null) => {
    foldApiRef.current = api
  }, [])

  const clearFocusRef = useRef(() => {})
  const clearFocus = useCallback(() => clearFocusRef.current(), [])

  const levels = useLevelPresets({
    model,
    game,
    activeStation,
    relationIndex,
    setSelectedIds,
  })

  const recommended = useRecommendedPresets({
    model,
    game,
    setSelectedIds,
  })

  const presets = useSelectionPresetsState({
    game,
    selectedIds,
    setSelectedIds,
    ladderChecked: levels.ladderChecked,
    setLadderChecked: levels.setLadderChecked,
    lowerDifficultyPreset: levels.lowerDifficultyPreset,
    setLowerDifficultyPreset: levels.setLowerDifficultyPreset,
    higherDifficultyPreset: levels.higherDifficultyPreset,
    setHigherDifficultyPreset: levels.setHigherDifficultyPreset,
    lastGlobalLadder: levels.lastGlobalLadder,
    setLastGlobalLadder: levels.setLastGlobalLadder,
    lastGlobalLowerDifficulty: levels.lastGlobalLowerDifficulty,
    setLastGlobalLowerDifficulty: levels.setLastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty: levels.lastGlobalHigherDifficulty,
    setLastGlobalHigherDifficulty: levels.setLastGlobalHigherDifficulty,
    stationLevelPresets: levels.stationLevelPresets,
    setStationLevelPresets: levels.setStationLevelPresets,
    recommendedChecked: recommended.checkedRecommended,
    setRecommendedChecked: recommended.setCheckedRecommended,
    packagesChecked: recommended.checkedPackages,
    setPackagesChecked: recommended.setCheckedPackages,
  })

  useEffect(() => {
    void setAppWindowTitle(projectMeta?.name ?? null)
  }, [projectMeta?.name])

  const filtersActive = useMemo(
    () => isFilterActive(filters, filterOptions.tags, filterSeed),
    [filters, filterOptions.tags, filterSeed],
  )

  const { visibleStations, displayNodes, globalSearchHits, globalSearchLoading, navigableScreens } =
    useStationTrees({
      model,
      game,
      selectedIds,
      activeStation,
      searchScope,
      filters,
      filtersActive,
      modsByCodename,
      filterSeed,
    })

  const branchNav = useBranchNav({
    activeStation,
    displayNodes,
    onClearFocus: clearFocus,
  })

  const {
    isBranchNavStation,
    isContentStation,
    isMechanicsStation,
    contentMainKey,
    contentSubKey,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
    contentMainBranches,
    contentSubBranches,
    selectedMain,
    selectedSub,
    listNodes,
    treeKey,
    selectContentMain,
    selectContentSub,
  } = branchNav

  const presetFocus = usePresetTileFocus()

  const focus = useTreeFocus({
    model,
    game,
    selectedIds,
    displayNodes,
    activeStation,
    setActiveStation,
    isContentStation,
    isMechanicsStation,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
    relationIndex,
  })

  useEffect(() => {
    clearFocusRef.current = focus.clearFocus
  }, [focus.clearFocus])

  function dismissRouteTip() {
    setShowRouteTip(false)
    writeRouteTipDismissed()
  }

  const goToPhase = useCallback((phase: AppPhase) => {
    setMountedPhases((prev) => (prev[phase] ? prev : { ...prev, [phase]: true }))
    setAppPhase(phase)
  }, [])

  const onModsBusyChange = useCallback((busy: boolean) => {
    setPhaseBusy((prev) => (prev.mods === busy ? prev : { ...prev, mods: busy }))
  }, [])

  const onInstallBusyChange = useCallback((busy: boolean) => {
    setPhaseBusy((prev) =>
      prev.install === busy ? prev : { ...prev, install: busy },
    )
  }, [])

  const setModsBlocking = useCallback((busy: boolean) => {
    setBlockingFlags((prev) => (prev.mods === busy ? prev : { ...prev, mods: busy }))
  }, [])

  const setInstallBlocking = useCallback((busy: boolean) => {
    setBlockingFlags((prev) =>
      prev.install === busy ? prev : { ...prev, install: busy },
    )
  }, [])

  const setSettingsBlocking = useCallback((busy: boolean) => {
    setBlockingFlags((prev) =>
      prev.settings === busy ? prev : { ...prev, settings: busy },
    )
  }, [])

  const setWizardBlocking = useCallback((busy: boolean) => {
    setBlockingFlags((prev) =>
      prev.wizard === busy ? prev : { ...prev, wizard: busy },
    )
  }, [])

  const appBlocking = isAppBlocking(blockingFlags)
  const exitConfirm = useMemo(() => exitConfirmCopy(blockingFlags), [blockingFlags])

  const route = useRouteNav({
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
    onRouteJustCompleted: () => {
      const required = listSelectedModCodenames(model, selectedIds)
      setModsJourney({ locked: true, requiredCodenames: required })
      setDetailCollapsed(true)
      goToPhase('mods')
    },
  })

  function openModsJourneyFromBanner() {
    const required = listSelectedModCodenames(model, selectedIds)
    setModsJourney({ locked: true, requiredCodenames: required })
    setDetailCollapsed(true)
    goToPhase('mods')
    route.setHideCaughtUp(true)
  }

  function onPhaseChange(phase: AppPhase) {
    if (phase === 'install' && !installPhaseReady && !phaseBusy.install) return
    if (phase === appPhase) return
    if (phase === 'mods') {
      // Phase nav opens the library; keep journey state intact so the banner
      // persists as long as the route is complete.
    }
    if (phase === 'install') {
      const missing = getMissingInstallPaths(game, gameFolders)
      if (missing.length > 0) {
        setSettingsFocusField(firstMissingFocusField(missing))
        setSettingsHighlightMissing(missing)
        setSettingsOpen(true)
      }
    }
    goToPhase(phase)
  }

  const stationDesc = useMemo(() => {
    if (isSetupSlot(activeStation)) return undefined
    const block = model.stations.find((s) => s.stationId === activeStation)
    return block?.roots.find((r) => r.attrs.desc)?.attrs.desc
  }, [activeStation, model.stations])

  const isAllSections = searchScope === 'all'

  const emptyCopy = useMemo(
    () =>
      listEmptyCopy({
        listNodesLength: listNodes.length,
        isContentStation,
        isMechanicsStation,
        contentSubBranchesLength: contentSubBranches.length,
        selectedSub,
        selectedMain,
        filtersActive,
      }),
    [
      listNodes.length,
      isContentStation,
      isMechanicsStation,
      contentSubBranches.length,
      selectedSub,
      selectedMain,
      filtersActive,
    ],
  )

  const listCheckState = useMemo(() => {
    if (!game) return 'unchecked' as const
    return listSelectionState(listNodes, selectedIds, game)
  }, [game, listNodes, selectedIds])

  const neededCodenames = useMemo(
    () => listSelectedModCodenames(model, selectedIds),
    [model, selectedIds],
  )
  const selectedModsCount = neededCodenames.length

  const recommendedGroups = useMemo(() => {
    if (!game) return []
    return buildRecommendedCatalog(model, game, selectedIds)
  }, [game, model, selectedIds])

  const onPresetsStation = normalizeStation(activeStation) === 'presets'

  const presetRecommendedCounts = useMemo(() => {
    if (!game || recommendedGroups.length === 0) return undefined
    return countAllRecommendedContent(model, game, recommendedGroups, selectedIds)
  }, [game, model, recommendedGroups, selectedIds])

  const presetPreview = useMemo(() => {
    if (!game || !onPresetsStation || !presetFocus.displayTile) return null
    return buildPresetTilePreview({
      model,
      game,
      selectedIds,
      tile: presetFocus.displayTile,
      ladderChecked: levels.ladderChecked,
      lowerDifficulty: levels.lowerDifficultyPreset,
      higherDifficulty: levels.higherDifficultyPreset,
      checkedRecommended: recommended.checkedRecommended,
      checkedPackages: recommended.checkedPackages,
      modsByCodename,
    })
  }, [
    game,
    onPresetsStation,
    presetFocus.displayTile,
    model,
    selectedIds,
    levels.ladderChecked,
    levels.lowerDifficultyPreset,
    levels.higherDifficultyPreset,
    recommended.checkedRecommended,
    recommended.checkedPackages,
  ])

  const installPhaseReady = useMemo(() => {
    if (!game || !isDesktopApp()) return false
    if (!route.routeComplete) return false
    const map = new Map(userCatalog.mods.map((m) => [m.codename.toLowerCase(), m]))
    return neededCodenames.every((c) => {
      const m = map.get(c.toLowerCase())
      return m != null && m.diskStatus !== 'not_present'
    })
  }, [game, neededCodenames, route.routeComplete, userCatalog.mods])

  const installPhaseTitle = useMemo(() => {
    if (!isDesktopApp()) return 'Requires the desktop app'
    if (!game) return 'Choose an engine first'
    if (!route.routeComplete) return 'Finish every components station first'
    if (!installPhaseReady) return 'Download all required mods first'
    return undefined
  }, [game, installPhaseReady, route.routeComplete])

  const globalSearchCheckState = useMemo(() => {
    if (!game) return 'unchecked' as const
    const checkable = globalSearchHits.filter((h) => h.checkable)
    if (checkable.length === 0) return 'unchecked' as const
    const nodes = checkable.map(
      (h) => ({ node: h.component, children: [] }) as DisplayNode,
    )
    return listSelectionState(nodes, selectedIds, game)
  }, [game, globalSearchHits, selectedIds])

  const showDetail = !!game && (onPresetsStation || !isSetupSlot(activeStation))
  const showComponentsChrome = appPhase === 'components'

  const buildGameSession = useCallback(() => {
    if (!game) return null
    let install = installSnapshotRef.current ?? undefined
    if (install) {
      install = sanitizeInstallSession(model, game, selectedIds, install)
    }
    return buildGameSessionSnapshot({
      selectedIds,
      finishedStations: route.finishedStations,
      routeUnlocked,
      selectionPresets: presets.allSelectionPresets,
      activePresetId: presets.activePresetId,
      presetBaseline: presets.presetBaseline,
      activeStation,
      contentMainKey,
      contentSubKey,
      contentSubTag,
      ladderChecked: levels.ladderChecked,
      lowerDifficultyPreset: levels.lowerDifficultyPreset,
      higherDifficultyPreset: levels.higherDifficultyPreset,
      lastGlobalLadder: levels.lastGlobalLadder,
      lastGlobalLowerDifficulty: levels.lastGlobalLowerDifficulty,
      lastGlobalHigherDifficulty: levels.lastGlobalHigherDifficulty,
      stationLevelPresets: levels.stationLevelPresets,
      recommendedChecked: recommended.checkedRecommended,
      packagesChecked: recommended.checkedPackages,
      modsJourney,
      ...(install ? { install } : {}),
    })
  }, [
    activeStation,
    contentMainKey,
    contentSubKey,
    contentSubTag,
    game,
    levels.higherDifficultyPreset,
    levels.lastGlobalHigherDifficulty,
    levels.lastGlobalLadder,
    levels.lastGlobalLowerDifficulty,
    levels.ladderChecked,
    levels.lowerDifficultyPreset,
    levels.stationLevelPresets,
    recommended.checkedPackages,
    recommended.checkedRecommended,
    modsJourney,
    presets.activePresetId,
    presets.allSelectionPresets,
    presets.presetBaseline,
    route.finishedStations,
    routeUnlocked,
    selectedIds,
    model,
  ])

  const { flushSession } = useProjectSessionPersistence({
    projectId,
    appPhase,
    buildGameSession,
  })

  const { exitConfirmOpen, confirmExit, cancelExit } = useAppExitGuard({
    blocking: appBlocking,
    onFlushSession: flushSession,
  })

  const onInstallSessionChange = useCallback((session: PersistedInstallSession | null) => {
    installSnapshotRef.current = session ?? undefined
    setInstallSession(session)
  }, [])

  function openProject(id: ProjectId) {
    const loaded = loadProjectRecord(model, id)
    if (!loaded) return
    const { record, session, install } = loaded
    const engine = record.meta.engine

    setProjectId(record.meta.id)
    setProjectMeta(record.meta)
    setGameFolders(record.meta.destinations)
    setGame(engine)
    setAppPhase('components')
    setMountedPhases({
      components: true,
      mods: false,
      install: !!install,
    })
    setSearchScope('section')
    clearFocus()

    if (!session) {
      setRouteUnlocked(true)
      setSelectedIds(createInitialSelection(model, engine))
      levels.seedFixesBaseline(engine)
      recommended.seedFixesBaseline(engine)
      presets.restoreSelectionPresetsState({
        presets: [],
        activePresetId: null,
        presetBaseline: null,
      })
      route.replaceFinishedStations([])
      setActiveStation('presets')
      setContentMainKey(null)
      setContentSubKey(null)
      setContentSubTag(null)
      setModsJourney(null)
      installSnapshotRef.current = undefined
      setRestoredInstallSession(undefined)
      setInstallSession(null)
    } else {
      setRouteUnlocked(session.routeUnlocked)
      setSelectedIds(new Set(session.selectedIds))
      levels.restoreLevelState(levelPresetsInitialFromSession(session))
      recommended.restoreRecommendedState(recommendedPresetsInitialFromSession(session))
      presets.restoreSelectionPresetsState({
        presets: session.selectionPresets,
        activePresetId: session.activePresetId,
        presetBaseline: session.presetBaseline,
      })
      route.replaceFinishedStations(session.finishedStations)
      setActiveStation(normalizeStation(session.activeStation))
      setContentMainKey(session.contentMainKey)
      setContentSubKey(session.contentSubKey)
      setContentSubTag(session.contentSubTag)
      setModsJourney(session.modsJourney)
      installSnapshotRef.current = install
      setRestoredInstallSession(install)
      setInstallSession(install ?? null)
    }

    setShellView('workspace')
  }

  function goToProjectEntry() {
    setShellView(listProjects().length === 0 ? 'wizard' : 'hub')
  }

  function returnToHub() {
    if (appBlocking) return
    flushSession()
    setProjectId(null)
    setProjectMeta(null)
    goToProjectEntry()
  }

  function onPresetsRecommendedToggle(token: string, wantChecked: boolean) {
    if (installSelectionFrozen) return
    recommended.onRecommendedToggle(token, wantChecked)
  }

  function onPresetsPackageToggle(token: string, wantChecked: boolean) {
    if (installSelectionFrozen) return
    recommended.onPackageToggle(token, wantChecked)
  }

  function resetComponentSelection() {
    if (!game) return
    levels.resetLevelPresets()
    recommended.resetRecommendedPresets()
    presets.resetPresetSelection()
    setSelectedIds(createInitialSelection(model, game))
    route.reopenEntireRoute()
    clearFocus()
  }

  function openResetAllConfirm() {
    if (appBlocking) return
    setResetAllConfirmOpen(true)
  }

  function cancelResetAllConfirm() {
    setResetAllConfirmOpen(false)
  }

  function confirmResetAll() {
    setResetAllConfirmOpen(false)
    if (installLock.mode !== 'none') {
      setMountedPhases((prev) => ({ ...prev, install: true }))
      setResetAllRestartOpen(true)
      return
    }
    resetComponentSelection()
    pushToast({ tone: 'success', message: 'Project reset.' })
  }

  function cancelResetAllRestart() {
    setResetAllRestartOpen(false)
    setPendingVanillaRestartScope(null)
  }

  function confirmResetAllRestart(scope: RestartScope) {
    setResetAllRestartOpen(false)
    setPendingVanillaRestartScope(scope)
  }

  useEffect(() => {
    if (!pendingVanillaRestartScope || !installActions) return
    const scope = pendingVanillaRestartScope
    setPendingVanillaRestartScope(null)
    void (async () => {
      const ok = await installActions.performVanillaRestart(scope)
      if (!ok) return
      resetComponentSelection()
      pushToast({ tone: 'success', message: 'Project reset.' })
    })()
  }, [pendingVanillaRestartScope, installActions])

  function onToggleAll(wantSelected: boolean) {
    if (!game || installSelectionFrozen) return
    setSelectedIds((prev) => toggleListSelection(model, prev, game, listNodes, wantSelected))
  }

  function onToggleAllSearch(wantSelected: boolean) {
    if (!game || installSelectionFrozen) return
    const nodes = globalSearchHits
      .filter((h) => h.checkable)
      .map((h) => ({ node: h.component, children: [] }) as DisplayNode)
    setSelectedIds((prev) => toggleListSelection(model, prev, game, nodes, wantSelected))
  }

  const toggleRailCollapsed = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev
      writeRailCollapsed(next)
      return next
    })
  }, [])

  const toggleDetailCollapsed = useCallback(() => {
    setDetailCollapsed((prev) => {
      const next = !prev
      writeDetailCollapsed(next)
      return next
    })
  }, [])

  function handleExport() {
    if (appPhase === 'mods') {
      setCsvExportOpen(true)
      return
    }
    if (appPhase === 'install') {
      if (!game) {
        setExportOpen(true)
        return
      }
      void (async () => {
        const hasLog = await hasAnyWeiduLog(game, gameFolders)
        if (hasLog) setWeiduExportOpen(true)
        else setExportOpen(true)
      })()
      return
    }
    setExportOpen(true)
  }

  const exportTip =
    appPhase === 'mods'
      ? 'Preview and save mods CSV'
      : appPhase === 'install'
        ? 'Preview and save WeiDU.log'
        : 'Preview and save install order'

  const exportDisabled =
    appPhase === 'mods'
      ? userCatalog.mods.length === 0
      : appPhase === 'install'
        ? false
        : selectedIds.size === 0

  function selectPresets() {
    if (!game || !routeUnlocked) return
    setActiveStation('presets')
    setSearchScope('section')
    clearFocus()
  }

  function continueFromPresets() {
    route.markStationFinished('presets')
    route.goNextScreen()
  }

  function selectStation(id: StationId) {
    if (!routeUnlocked) return
    setActiveStation(id)
    setSearchScope('section')
    clearFocus()
  }

  function finishRoute() {
    route.finishEntireRoute()
  }

  function reopenRoute() {
    if (routeReopenDisabled) return
    route.reopenEntireRoute()
    setModsJourney(null)
  }

  function reopenCurrentStation() {
    if (routeReopenDisabled) return
    route.unmarkStationFinished()
  }

  const onNavigateToComponent = useCallback(
    (componentId: string) => {
      // Leave global search so the station tree / jump target is visible.
      setSearchScope('section')
      focus.onNavigateToComponent(componentId)
    },
    [focus.onNavigateToComponent],
  )

  const onJumpFromSearch = onNavigateToComponent

  const onToggle = useCallback(
    (display: DisplayNode, wantSelected: boolean) => {
      if (!game || installWorking) return
      if (
        installLock.mode !== 'none' &&
        isDisplaySelectionLocked(display, installLock, model, relationIndex)
      ) {
        return
      }
      setSelectedIds((prev) => toggleDisplayNode(model, prev, game, display, wantSelected))
    },
    [game, model, installLock, installWorking, relationIndex],
  )

  const onRandomize = useCallback(
    (display: DisplayNode, options: RandomizeOptions) => {
      if (!game || installSelectionFrozen) return
      setSelectedIds((prev) =>
        randomizeDisplaySubtree(model, prev, game, display, options),
      )
    },
    [game, model, installSelectionFrozen],
  )

  const onDeselectComponent = useCallback(
    (componentId: string) => {
      if (!game) return
      const stepIndex = installLock.componentStepIndex.get(componentId)
      const step = installSession?.run?.steps.find((s) => s.componentId === componentId)
      if (stepIndex == null || !step) return
      if (!canRemoveStepFromPlan(stepIndex, step.status, installLock)) return
      const comp = model.componentsById.get(componentId)
      if (!comp) return
      setSelectedIds((prev) =>
        toggleDisplayNode(model, prev, game, { node: comp, children: [] }, false),
      )
    },
    [game, installLock, installSession, model],
  )

  function focusComponentTree() {
    const searchRow = document.querySelector<HTMLElement>(
      '.global-search-list [role="option"][tabindex="0"]',
    )
    if (searchRow) {
      searchRow.focus()
      return
    }
    const row = document.querySelector<HTMLElement>(
      '.component-tree [role="treeitem"][tabindex="0"]',
    )
    row?.focus()
  }

  function focusModsTable() {
    const focused = document.querySelector<HTMLElement>(
      '#mods-table [role="row"][tabindex="0"]',
    )
    if (focused) {
      focused.focus()
      return
    }
    const first = document.querySelector<HTMLElement>(
      '#mods-table [role="row"][tabindex="-1"]',
    )
    if (first) {
      first.focus()
      return
    }
    document.getElementById('mods-table')?.focus()
  }

  function focusInstallTable() {
    const focused = document.querySelector<HTMLElement>(
      '#install-table [role="row"][tabindex="0"]',
    )
    if (focused) {
      focused.focus()
      return
    }
    const first = document.querySelector<HTMLElement>(
      '#install-table tr.install-row',
    )
    if (first) {
      first.focus()
      return
    }
    document.getElementById('install-table')?.focus()
  }

  function focusMainDisplay() {
    if (appPhase === 'mods') {
      focusModsTable()
      return
    }
    if (appPhase === 'install') {
      focusInstallTable()
      return
    }
    if (activeStation === 'presets') {
      document.querySelector<HTMLElement>('.presets-station .level-card input')?.focus()
      return
    }
    focusComponentTree()
  }

  function onFoldAll() {
    foldApiRef.current?.foldAll()
  }

  function onUnfoldAll() {
    foldApiRef.current?.unfoldAll()
  }

  const stationTitle = (() => {
    const station = normalizeStation(activeStation)
    if (station === 'presets') return 'Presets'
    if (station === 'content' || station === 'mechanics') {
      const sectionLabel =
        selectedMain?.node.attrs.label ?? selectedMain?.node.tag
      return sectionLabel
        ? `${sectionLabel} ${STATION_LABELS[station]}`
        : STATION_LABELS[station]
    }
    return STATION_LABELS[station]
  })()

  const applyStationSlot = useCallback(
    (slot: StationSlot) => {
      if (!game || !routeUnlocked) return
      setActiveStation(normalizeStation(slot))
      setSearchScope('section')
      clearFocus()
    },
    [clearFocus, game, routeUnlocked],
  )

  const openKeyboardHelp = useCallback(() => setKeyboardHelpOpen(true), [])
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const openSettings = useCallback(() => {
    setSettingsFocusField(null)
    setSettingsHighlightMissing([])
    setSettingsOpen(true)
  }, [])
  const openSettingsModsDownload = useCallback(() => {
    setSettingsFocusField('modsDownloadDir')
    setSettingsHighlightMissing([])
    setSettingsOpen(true)
  }, [])
  const openSettingsForMissing = useCallback((missing: MissingInstallPath[]) => {
    setSettingsFocusField(firstMissingFocusField(missing))
    setSettingsHighlightMissing(missing)
    setSettingsOpen(true)
  }, [])

  useEffect(() => {
    if (activeStation === 'engine') setActiveStation('presets')
  }, [activeStation])

  useChromeHotkeys({
    keyboardHelpOpen,
    showDetail: (showComponentsChrome && showDetail) || appPhase === 'mods' || appPhase === 'install',
    activeStation,
    visibleStations,
    mainBranches: contentMainBranches,
    subBranches: contentSubBranches,
    mainKey: contentMainKey,
    subKey: contentSubKey,
    branchMainCycleActive: isBranchNavStation && showComponentsChrome,
    contentSubCycleActive: isContentStation && showComponentsChrome,
    onToggleRailCollapsed: toggleRailCollapsed,
    onToggleDetailCollapsed: toggleDetailCollapsed,
    onOpenKeyboardHelp: openKeyboardHelp,
    onSelectMain: selectContentMain,
    onSelectSub: selectContentSub,
    onApplyStationSlot: applyStationSlot,
    onFocusMainDisplay: focusMainDisplay,
  })

  return (
    <div className="app">
      {shellView === 'hub' ? (
        <ProjectHub
          onOpen={openProject}
          onCreateNew={() => setShellView('wizard')}
          onProjectsChanged={() => {
            if (listProjects().length === 0) setShellView('wizard')
          }}
        />
      ) : shellView === 'wizard' ? (
        <ProjectWizard
          canCancel={listProjects().length > 0}
          onCancel={goToProjectEntry}
          onCreated={openProject}
          settingsOpen={settingsOpen}
          onOpenSettings={openSettings}
          onBusyChange={setWizardBlocking}
        />
      ) : (
        <>
      <AppTopBar
        phase={appPhase}
        onPhaseChange={onPhaseChange}
        installDisabled={!installPhaseReady}
        installTitle={installPhaseTitle}
        processingPhases={phaseBusy}
        game={game}
        projectName={projectMeta?.name ?? null}
        onSwitchProject={returnToHub}
        switchProjectDisabled={appBlocking}
        switchProjectTip={projectsBlockedTip(blockingFlags)}
        selectedModsCount={selectedModsCount}
        selectedCount={selectedIds.size}
        presets={presets.gamePresets.map((p) => ({ id: p.id, name: p.name }))}
        activePresetId={
          presets.activePreset?.game === game ? presets.activePresetId : null
        }
        activePresetName={
          presets.activePreset?.game === game ? presets.activePreset.name : null
        }
        dirty={presets.presetDirty}
        canSave={game != null && (presets.activePresetId == null || presets.presetDirty)}
        canDelete={presets.activePreset != null && presets.activePreset.game === game}
        onSelectPreset={presets.loadSelectionPreset}
        onSave={presets.saveSelectionPreset}
        onRename={presets.renameSelectionPreset}
        onDelete={presets.deleteSelectionPreset}
        keyboardHelpOpen={keyboardHelpOpen}
        onOpenKeyboardHelp={openKeyboardHelp}
        aboutOpen={aboutOpen}
        onOpenAbout={openAbout}
        settingsOpen={settingsOpen}
        onOpenSettings={openSettings}
        onExport={handleExport}
        exportDisabled={exportDisabled}
        exportTip={exportTip}
        onResetAll={openResetAllConfirm}
        resetAllDisabled={appBlocking}
        resetAllTip={
          appBlocking
            ? projectsBlockedTip(blockingFlags)
            : 'Reset installation and component selection'
        }
      />

      {mountedPhases.mods ? (
        <div className="app-body mods-app-body" hidden={appPhase !== 'mods'}>
          <div className="app-main mods-app-main">
            <ModsStation
              model={model}
              selectedIds={selectedIds}
              mods={userCatalog.mods}
              neededCodenames={neededCodenames}
              journey={modsJourney}
              routeComplete={route.routeComplete}
              detailCollapsed={detailCollapsed}
              detailWidth={detailWidth}
              onDetailWidthChange={setDetailWidth}
              onToggleDetailCollapsed={toggleDetailCollapsed}
              onAddMod={userCatalog.addMod}
              onEditMod={userCatalog.editMod}
              onDeleteMod={userCatalog.deleteMod}
              onSetDiskStatus={userCatalog.setDiskStatus}
              onApplyAcquireSuccess={userCatalog.applyAcquireSuccess}
              onRefreshDiskStatus={userCatalog.refreshDiskStatus}
              onRemoveFromDisk={userCatalog.removeFromDisk}
              onOpenSettings={openSettingsModsDownload}
              onProceedToInstall={() => onPhaseChange('install')}
              onBusyChange={onModsBusyChange}
              onExitBlockingChange={setModsBlocking}
              installLock={installLock}
            />
          </div>
        </div>
      ) : null}

      {mountedPhases.install ? (
        <div
          className="app-body mods-app-body install-app-body"
          hidden={appPhase !== 'install'}
        >
          <div className="app-main mods-app-main install-app-main">
            <InstallStation
              key={projectId ?? game ?? 'no-game'}
              model={model}
              selectedIds={selectedIds}
              game={game}
              gameFolders={gameFolders}
              projectId={projectId}
              neededCodenames={neededCodenames}
              mods={userCatalog.mods}
              detailCollapsed={detailCollapsed}
              detailWidth={detailWidth}
              onDetailWidthChange={setDetailWidth}
              onToggleDetailCollapsed={toggleDetailCollapsed}
              onOpenSettings={openSettings}
              onOpenSettingsForMissing={openSettingsForMissing}
              onBusyChange={onInstallBusyChange}
              onExitBlockingChange={setInstallBlocking}
              initialInstallSession={restoredInstallSession}
              onInstallSessionChange={onInstallSessionChange}
              onDeselectComponent={onDeselectComponent}
              installLock={installLock}
              onInstallActionsReady={setInstallActions}
            />
          </div>
        </div>
      ) : null}

      {mountedPhases.components ? (
      <div className="app-body" hidden={appPhase !== 'components'}>
        <StationNav
          game={game}
          routeUnlocked={routeUnlocked}
          activeStation={normalizeStation(activeStation)}
          visibleStations={visibleStations}
          finishedStations={route.finishedStations}
          finishedCount={route.routeProgress.finishedCount}
          totalCount={route.routeProgress.totalCount}
          collapsed={railCollapsed}
          onToggleCollapsed={toggleRailCollapsed}
          onSelectPresets={selectPresets}
          onSelectStation={selectStation}
          onFinishRoute={finishRoute}
          onReopenRoute={reopenRoute}
          routeReopenDisabled={routeReopenDisabled}
        />

        <div className="app-main">
          <div
            className={`workspace${showDetail ? '' : ' engine-only'}${
              showDetail && detailCollapsed ? ' detail-collapsed' : ''
            }`}
            style={
              showDetail
                ? ({ '--detail-width': `${detailWidth}px` } as CSSProperties)
                : undefined
            }
          >
            <div className="list-pane">
              <RouteGuideTip visible={showRouteTip && routeUnlocked} onDismiss={dismissRouteTip} />
              <RouteCaughtUp
                visible={route.routeComplete && !route.hideCaughtUp && !showRouteTip}
                selectedCount={selectedIds.size}
                onOpenMods={openModsJourneyFromBanner}
                onExport={handleExport}
                onDismiss={() => route.setHideCaughtUp(true)}
              />
              <PresetLoadNotice
                visible={presets.presetNotice != null && !showRouteTip}
                presetName={presets.presetNotice?.name ?? ''}
                added={presets.presetNotice?.added ?? 0}
                removed={presets.presetNotice?.removed ?? 0}
                onDismiss={() => presets.setPresetNotice(null)}
              />
              <div className="list-pane-body">
                {!game || normalizeStation(activeStation) === 'presets' ? (
                  <div className="list-pane-scroll engine-pane-scroll">
                    <PresetsStation
                      enabled={!!game && !route.currentFinished}
                      model={model}
                      recommendedGroups={recommendedGroups}
                      checkedRecommended={recommended.checkedRecommended}
                      checkedPackages={recommended.checkedPackages}
                      onRecommendedToggle={onPresetsRecommendedToggle}
                      onPackageToggle={onPresetsPackageToggle}
                      recommendedCounts={presetRecommendedCounts}
                      onTileFocus={presetFocus.onTileFocus}
                      onTileHover={presetFocus.onTileHover}
                      isTileFocused={presetFocus.isTileFocused}
                      finished={route.currentFinished}
                      canContinue={route.canCycleScreens}
                      onContinue={continueFromPresets}
                      onReopen={reopenCurrentStation}
                      reopenDisabled={routeReopenDisabled}
                    />
                  </div>
                ) : isAllSections ? (
                  <>
                    <div className="list-pane-header">
                      <div className="list-pane-header-title">
                        <h2>Search</h2>
                      </div>
                      <p className="lede">
                        Find any eligible component across stations. Locked options
                        stay listed until their requirements are met.
                      </p>
                      <GlobalSearchToolbar
                        resultCount={globalSearchHits.length}
                        checkableCount={
                          globalSearchHits.filter((h) => h.checkable).length
                        }
                        listState={globalSearchCheckState}
                        onToggleAll={onToggleAllSearch}
                        searchQuery={filters.search}
                        loading={globalSearchLoading}
                      />
                    </div>
                    <div className="list-pane-scroll">
                      <GlobalSearchList
                        hits={globalSearchHits}
                        selectedIds={selectedIds}
                        game={game}
                        focusedComponentId={focus.focusedComponentId}
                        onFocus={focus.onFocusSearchResult}
                        onHover={focus.onHoverSearchResult}
                        onToggle={onToggle}
                        onJump={onJumpFromSearch}
                        searchQuery={filters.search}
                        filtersActive={filtersActive}
                        loading={globalSearchLoading}
                        selectionLockedIds={selectionLockedIds}
                        installedComponentIds={installLock.installedComponentIds}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="list-pane-header">
                      <div className="list-pane-header-title">
                        <h2>
                          {stationTitle}
                          {route.currentFinished && (
                            <span className="station-finished-mark" aria-label="Finished">
                              ✓
                            </span>
                          )}
                        </h2>
                        <div className="list-pane-header-actions">
                          <StationPresetsMenu
                            enabled={!route.currentFinished}
                            checkedLadderLevels={levels.activeStationPreset.ladder}
                            lowerDifficulty={levels.activeStationPreset.lowerDifficulty}
                            higherDifficulty={levels.activeStationPreset.higherDifficulty}
                            onLadderToggle={levels.onStationLadderToggle}
                            onDifficultyChange={levels.onStationDifficultyChange}
                            onClearToGlobal={levels.onClearToGlobal}
                          />
                          <ScreenNavButtons
                            canCycle={route.canCycleScreens}
                            canOk={route.canMarkFinished}
                            finished={route.currentFinished}
                            onPrevious={route.goPrevScreen}
                            onNext={route.goNextScreen}
                            onOk={route.onOk}
                            onCancel={reopenCurrentStation}
                            reopenDisabled={routeReopenDisabled}
                          />
                        </div>
                      </div>
                      {stationDesc ? (
                        <p className="lede">{stationDesc}</p>
                      ) : null}
                      <StationListToolbar
                        listNodes={listNodes}
                        listState={listCheckState}
                        onToggleAll={onToggleAll}
                        onFoldAll={onFoldAll}
                        onUnfoldAll={onUnfoldAll}
                        selectAllDisabled={installSelectionFrozen}
                      >
                        {activeStation === 'content' ||
                        activeStation === 'mechanics' ? (
                          <StationBranchNav
                            station={activeStation}
                            mainBranches={contentMainBranches}
                            subBranches={contentSubBranches}
                            mainKey={contentMainKey}
                            subKey={contentSubKey}
                            onSelectMain={selectContentMain}
                            onSelectSub={selectContentSub}
                          />
                        ) : null}
                      </StationListToolbar>
                    </div>
                    <div className="list-pane-scroll">
                      <ComponentTree
                        key={treeKey}
                        treeKey={treeKey}
                        nodes={listNodes}
                        selectedIds={selectedIds}
                        game={game}
                        model={model}
                        modsByCodename={modsByCodename}
                        focusedKey={focus.focusedKey}
                        onFocus={focus.onFocus}
                        onHover={focus.onHover}
                        onToggle={onToggle}
                        onRandomize={onRandomize}
                        onFoldApiReady={onFoldApiReady}
                        expandKeys={focus.pendingExpandKeys}
                        onExpandKeysApplied={focus.clearPendingExpandKeys}
                        emptyTitle={emptyCopy?.title}
                        emptyBody={emptyCopy?.body}
                        readonly={route.currentFinished || installWorking}
                        selectionLockedIds={selectionLockedIds}
                        installedComponentIds={installLock.installedComponentIds}
                      />
                    </div>
                  </>
                )}
                {warnings.length > 0 && (
                  <details className="warnings">
                    <summary>{warnings.length} parse notes</summary>
                    <ul>
                      {warnings.slice(0, 30).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              {game != null && !isSetupSlot(activeStation) && (
                <FiltersStrip
                  criteria={filters}
                  onChange={setFilters}
                  tagOptions={filterOptions.tags}
                  authorOptions={catalogAuthorOptions}
                  sizeBounds={filterSeed.sizeBounds}
                  onRequestTreeFocus={focusComponentTree}
                  searchScope={searchScope}
                  onSearchScopeChange={setSearchScope}
                  searchPlaceholder={
                    isAllSections
                      ? 'Search all components...'
                      : 'Search in this window...'
                  }
                />
              )}
            </div>

            {showDetail && (
              <DetailPane
                collapsed={detailCollapsed}
                width={detailWidth}
                onWidthChange={setDetailWidth}
                onToggleCollapsed={toggleDetailCollapsed}
                ariaLabel={onPresetsStation ? 'Preset details' : 'Component details'}
                display={focus.detailDisplay}
                model={model}
                relationIndex={relationIndex}
                modsByCodename={modsByCodename}
                selectionState={focus.detailSelectionState}
                onNavigateToComponent={onNavigateToComponent}
              >
                {onPresetsStation ? (
                  <PresetDetail
                    preview={presetPreview}
                    onNavigateToComponent={onNavigateToComponent}
                  />
                ) : undefined}
              </DetailPane>
            )}
          </div>
        </div>
      </div>
      ) : null}

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <KeyboardHelp
        open={keyboardHelpOpen}
        phase={appPhase}
        onClose={() => setKeyboardHelpOpen(false)}
      />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        model={model}
        selectedIds={selectedIds}
        game={game}
      />
      <ModsCsvExportDialog
        open={csvExportOpen}
        onClose={() => setCsvExportOpen(false)}
        mods={userCatalog.mods}
      />
      {game ? (
        <WeiduLogExportDialog
          open={weiduExportOpen}
          onClose={() => setWeiduExportOpen(false)}
          game={game}
          gameFolders={gameFolders}
        />
      ) : null}
      <ConfirmDialog
        open={resetAllConfirmOpen}
        title="Reset all?"
        message={
          installLock.mode !== 'none'
            ? 'Clear all component selection, station progress, and restore your game folder from the vanilla backup? The install plan will reset.'
            : 'Clear all component selection, level presets, and station progress for this project?'
        }
        confirmLabel="Reset all"
        danger
        onConfirm={confirmResetAll}
        onCancel={cancelResetAllConfirm}
      />
      <RestartConfirmDialog
        open={resetAllRestartOpen}
        eetMode={game === 'eet'}
        onConfirm={confirmResetAllRestart}
        onCancel={cancelResetAllRestart}
      />
        </>
      )}
      <ConfirmDialog
        open={exitConfirmOpen}
        title={exitConfirm.title}
        message={exitConfirm.message}
        confirmLabel="Quit anyway"
        cancelLabel="Stay"
        danger
        onConfirm={() => void confirmExit()}
        onCancel={cancelExit}
      />
      <SettingsDialog
        open={settingsOpen}
        projectId={projectId}
        projectEngine={game}
        destinations={gameFolders}
        initialTab={defaultSettingsTabForContext(
          shellView === 'wizard' ? 'wizard' : appPhase,
        )}
        hideProjectTab={shellView === 'wizard'}
        onBusyChange={setSettingsBlocking}
        onDestinationsChange={(paths) => {
          if (!projectId) return
          updateProjectMeta(projectId, { destinations: paths })
          setGameFolders(paths)
          setProjectMeta((m) => (m ? { ...m, destinations: paths } : m))
        }}
        focusField={settingsFocusField}
        highlightMissing={settingsHighlightMissing}
        onClose={() => {
          setSettingsOpen(false)
          setSettingsFocusField(null)
          setSettingsHighlightMissing([])
        }}
      />
    </div>
  )
}
