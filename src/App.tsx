import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import installSequenceXml from './data/InstallSequence.xml?raw'
import { parseInstallSequence } from './lib/xml/parseInstallSequence'
import {
  STATION_LABELS,
  type SelectedGame,
  type StationId,
} from './lib/xml/schema'
import {
  createInitialSelection,
  listSelectionState,
  randomizeDisplaySubtree,
  selectionMatchesLevelBaseline,
  toggleDisplayNode,
  toggleListSelection,
  type RandomizeOptions,
} from './lib/selection/selectionEngine'
import {
  DIFFICULTY_LEVELS,
  LADDER_LEVELS,
  type DifficultyLevel,
  type LadderLevel,
} from './lib/levels'
import { countAllLevelContent } from './lib/selection/levelCounts'
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
import { EngineStation } from './ui/EngineStation'
import { PresetsStation } from './ui/PresetsStation'
import { ScreenNavButtons } from './ui/ScreenNavButtons'
import { ComponentTree, type TreeFoldApi } from './ui/ComponentTree'
import { StationBranchNav } from './ui/StationBranchNav'
import { StationListToolbar } from './ui/StationListToolbar'
import { GlobalSearchList } from './ui/GlobalSearchList'
import { GlobalSearchToolbar } from './ui/GlobalSearchToolbar'
import { FiltersStrip } from './ui/FiltersStrip'
import { AboutDialog } from './ui/AboutDialog'
import { KeyboardHelp } from './ui/KeyboardHelp'
import { RouteGuideTip } from './ui/RouteGuideTip'
import { RouteCaughtUp } from './ui/RouteCaughtUp'
import { SettingsDialog } from './ui/SettingsDialog'
import { ExportDialog } from './ui/ExportDialog'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { PresetLoadNotice } from './ui/PresetLoadNotice'
import { AppTopBar } from './ui/AppTopBar'
import { DetailPane } from './ui/DetailPane'
import { listSelectedModCodenames } from './lib/mods/loadMods'
import { useStationTrees } from './hooks/useStationTrees'
import { useBranchNav } from './hooks/useBranchNav'
import { useSelectionPresetsState } from './hooks/useSelectionPresetsState'
import { useLevelPresets } from './hooks/useLevelPresets'
import { useChromeHotkeys } from './hooks/useChromeHotkeys'
import { useRouteNav } from './hooks/useRouteNav'
import { useTreeFocus } from './hooks/useTreeFocus'
import { useUserCatalog } from './hooks/useUserCatalog'
import { type AppPhase } from './ui/PhaseNav'
import { ModsStation, type ModsJourneyState } from './ui/mods/ModsStation'
import { InstallStation } from './ui/install/InstallStation'
import { isDesktopApp } from './lib/desktop/fsDialogs'
import './index.css'

const parsed = parseInstallSequence(installSequenceXml)

export default function App() {
  const { model, warnings } = parsed
  const relationIndex = useMemo(() => buildRelationIndex(model), [model])
  const [game, setGame] = useState<SelectedGame | null>(null)
  const [routeUnlocked, setRouteUnlocked] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [activeStation, setActiveStation] = useState<AppNavSlot>('engine')
  const [appPhase, setAppPhase] = useState<AppPhase>('components')
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
    'modsDownloadDir' | 'weiduPath' | null
  >(null)
  const [showRouteTip, setShowRouteTip] = useState(() => !readRouteTipDismissed())
  const [railCollapsed, setRailCollapsed] = useState(() => readRailCollapsed())
  const [detailCollapsed, setDetailCollapsed] = useState(() => readDetailCollapsed())
  const [detailWidth, setDetailWidth] = useState(() => readDetailWidth())
  const [exportOpen, setExportOpen] = useState(false)
  type PendingSelectionReset =
    | { type: 'chooseGame'; game: SelectedGame }
    | { type: 'ladder'; level: LadderLevel; wantChecked: boolean }
    | { type: 'difficulty'; token: DifficultyLevel; want: boolean }
  const [pendingSelectionReset, setPendingSelectionReset] =
    useState<PendingSelectionReset | null>(null)
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
  })

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
      setAppPhase('mods')
    },
  })

  function openModsJourneyFromBanner() {
    const required = listSelectedModCodenames(model, selectedIds)
    setModsJourney({ locked: true, requiredCodenames: required })
    setAppPhase('mods')
    route.setHideCaughtUp(true)
  }

  function onPhaseChange(phase: AppPhase) {
    if (phase === 'install' && !installPhaseReady) return
    if (phase === appPhase) return
    if (phase === 'mods') {
      // Phase nav opens the library; journey lock only from Done / Open Mods.
      setModsJourney((prev) => (prev ? { ...prev, locked: false } : null))
    }
    setAppPhase(phase)
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

  const presetLevelCounts = useMemo(() => {
    if (!game) return undefined
    return countAllLevelContent(model, game, [...LADDER_LEVELS, ...DIFFICULTY_LEVELS])
  }, [game, model])

  const installPhaseReady = useMemo(() => {
    if (!game || !isDesktopApp()) return false
    const map = new Map(userCatalog.mods.map((m) => [m.codename.toLowerCase(), m]))
    return neededCodenames.every((c) => {
      const m = map.get(c.toLowerCase())
      return m != null && m.diskStatus !== 'not_present'
    })
  }, [game, neededCodenames, userCatalog.mods])

  const installPhaseTitle = useMemo(() => {
    if (!isDesktopApp()) return 'Requires the desktop app'
    if (!game) return 'Choose an engine first'
    if (!installPhaseReady) return 'Download all required mods first'
    return undefined
  }, [game, installPhaseReady])

  const globalSearchCheckState = useMemo(() => {
    if (!game) return 'unchecked' as const
    const checkable = globalSearchHits.filter((h) => h.checkable)
    if (checkable.length === 0) return 'unchecked' as const
    const nodes = checkable.map(
      (h) => ({ node: h.component, children: [] }) as DisplayNode,
    )
    return listSelectionState(nodes, selectedIds, game)
  }, [game, globalSearchHits, selectedIds])

  const showDetail = !isSetupSlot(activeStation) && !!game
  const showComponentsChrome = appPhase === 'components'

  function isSelectionDirty(): boolean {
    if (!game) return false
    return !selectionMatchesLevelBaseline(
      model,
      game,
      selectedIds,
      levels.ladderChecked,
      levels.lowerDifficultyPreset,
      levels.higherDifficultyPreset,
    )
  }

  function applyChooseGame(next: SelectedGame) {
    setGame(next)
    setRouteUnlocked(false)
    setSelectedIds(createInitialSelection(model, next))
    levels.seedFixesBaseline(next)
    presets.resetPresetSelection()
    route.resetFinishedStations()
    setActiveStation('engine')
    setSearchScope('section')
    clearFocus()
  }

  function chooseGame(next: SelectedGame) {
    if (game != null && isSelectionDirty()) {
      setPendingSelectionReset({ type: 'chooseGame', game: next })
      return
    }
    applyChooseGame(next)
  }

  function onPresetsLadderToggle(level: LadderLevel, wantChecked: boolean) {
    if (isSelectionDirty()) {
      setPendingSelectionReset({ type: 'ladder', level, wantChecked })
      return
    }
    levels.onLadderToggle(level, wantChecked)
  }

  function onPresetsDifficultyChange(token: DifficultyLevel, want: boolean) {
    if (isSelectionDirty()) {
      setPendingSelectionReset({ type: 'difficulty', token, want })
      return
    }
    levels.onDifficultyPresetChange(token, want)
  }

  function cancelSelectionReset() {
    setPendingSelectionReset(null)
  }

  function confirmSelectionReset() {
    if (!pendingSelectionReset) return
    const pending = pendingSelectionReset
    setPendingSelectionReset(null)
    if (pending.type === 'chooseGame') {
      applyChooseGame(pending.game)
      return
    }
    if (pending.type === 'ladder') {
      levels.onLadderToggle(pending.level, pending.wantChecked)
      return
    }
    levels.onDifficultyPresetChange(pending.token, pending.want)
  }

  function onToggleAll(wantSelected: boolean) {
    if (!game) return
    setSelectedIds((prev) => toggleListSelection(model, prev, game, listNodes, wantSelected))
  }

  function onToggleAllSearch(wantSelected: boolean) {
    if (!game) return
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
    setExportOpen(true)
  }

  function selectEngine() {
    setActiveStation('engine')
    setSearchScope('section')
    clearFocus()
  }

  function selectPresets() {
    if (!game || !routeUnlocked) return
    setActiveStation('presets')
    setSearchScope('section')
    clearFocus()
  }

  function continueFromEngine() {
    if (!game) return
    setRouteUnlocked(true)
    route.markStationsFinished(['engine', 'presets'])
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
      if (!game) return
      setSelectedIds((prev) => toggleDisplayNode(model, prev, game, display, wantSelected))
    },
    [game, model],
  )

  const onRandomize = useCallback(
    (display: DisplayNode, options: RandomizeOptions) => {
      if (!game) return
      setSelectedIds((prev) =>
        randomizeDisplaySubtree(model, prev, game, display, options),
      )
    },
    [game, model],
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

  function focusMainDisplay() {
    if (appPhase === 'mods') {
      focusModsTable()
      return
    }
    if (activeStation === 'engine') {
      document.querySelector<HTMLElement>('.engine-card')?.focus()
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

  const stationTitle =
    activeStation === 'engine'
      ? 'Engine'
      : activeStation === 'presets'
        ? 'Presets'
        : activeStation === 'content' || activeStation === 'mechanics'
          ? (() => {
              const sectionLabel =
                selectedMain?.node.attrs.label ?? selectedMain?.node.tag
              return sectionLabel
                ? `${sectionLabel} ${STATION_LABELS[activeStation]}`
                : STATION_LABELS[activeStation]
            })()
          : STATION_LABELS[activeStation]

  const applyStationSlot = useCallback(
    (slot: StationSlot) => {
      if (slot !== 'engine' && (!game || !routeUnlocked)) {
        setActiveStation('engine')
      } else {
        setActiveStation(slot)
      }
      setSearchScope('section')
      clearFocus()
    },
    [clearFocus, game, routeUnlocked],
  )

  const openKeyboardHelp = useCallback(() => setKeyboardHelpOpen(true), [])
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const openSettings = useCallback(() => {
    setSettingsFocusField(null)
    setSettingsOpen(true)
  }, [])
  const openSettingsModsDownload = useCallback(() => {
    setSettingsFocusField('modsDownloadDir')
    setSettingsOpen(true)
  }, [])

  useChromeHotkeys({
    keyboardHelpOpen,
    showDetail: (showComponentsChrome && showDetail) || appPhase === 'mods',
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
      <AppTopBar
        phase={appPhase}
        onPhaseChange={onPhaseChange}
        installDisabled={!installPhaseReady}
        installTitle={installPhaseTitle}
        game={game}
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
        railCollapsed={railCollapsed}
        onToggleRailCollapsed={toggleRailCollapsed}
      />

      {appPhase === 'mods' ? (
        <div className="app-body mods-app-body">
          <div className="app-main mods-app-main">
            <ModsStation
              mods={userCatalog.mods}
              neededCodenames={neededCodenames}
              journey={modsJourney}
              onClearJourneyLock={() =>
                setModsJourney((prev) =>
                  prev ? { ...prev, locked: false } : null,
                )
              }
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
            />
          </div>
        </div>
      ) : appPhase === 'install' ? (
        <div className="app-body mods-app-body install-app-body">
          <div className="app-main mods-app-main install-app-main">
            <InstallStation
              model={model}
              selectedIds={selectedIds}
              game={game}
              neededCodenames={neededCodenames}
              mods={userCatalog.mods}
              detailCollapsed={detailCollapsed}
              detailWidth={detailWidth}
              onDetailWidthChange={setDetailWidth}
              onToggleDetailCollapsed={toggleDetailCollapsed}
              onOpenSettings={openSettings}
            />
          </div>
        </div>
      ) : (
      <div className="app-body">
        <StationNav
          game={game}
          routeUnlocked={routeUnlocked}
          activeStation={activeStation}
          visibleStations={visibleStations}
          finishedStations={route.finishedStations}
          finishedCount={route.routeProgress.finishedCount}
          totalCount={route.routeProgress.totalCount}
          collapsed={railCollapsed}
          onSelectEngine={selectEngine}
          onSelectPresets={selectPresets}
          onSelectStation={selectStation}
          onFinishRoute={finishRoute}
        />

        <div className="app-main">
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
              <div className="list-pane-body">
                {!game || activeStation === 'engine' ? (
                  <div className="list-pane-scroll engine-pane-scroll">
                    <EngineStation
                      game={game}
                      onChoose={chooseGame}
                      canContinue={!!game}
                      onContinue={continueFromEngine}
                    />
                  </div>
                ) : activeStation === 'presets' ? (
                  <div className="list-pane-scroll engine-pane-scroll">
                    <PresetsStation
                      enabled
                      checkedLadderLevels={levels.ladderChecked}
                      lowerDifficulty={levels.lowerDifficultyPreset}
                      higherDifficulty={levels.higherDifficultyPreset}
                      onLadderToggle={onPresetsLadderToggle}
                      onDifficultyChange={onPresetsDifficultyChange}
                      levelCounts={presetLevelCounts}
                      canContinue={route.canCycleScreens}
                      onContinue={continueFromPresets}
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
                        <ScreenNavButtons
                          canCycle={route.canCycleScreens}
                          canOk={route.canMarkFinished}
                          finished={route.currentFinished}
                          onPrevious={route.goPrevScreen}
                          onNext={route.goNextScreen}
                          onOk={route.onOk}
                          onCancel={route.unmarkStationFinished}
                        />
                      </div>
                      {stationDesc ? (
                        <p className="lede">{stationDesc}</p>
                      ) : null}
                      <StationListToolbar
                        listNodes={listNodes}
                        listState={listCheckState}
                        checkedLadderLevels={levels.activeStationPreset.ladder}
                        lowerDifficulty={levels.activeStationPreset.lowerDifficulty}
                        higherDifficulty={levels.activeStationPreset.higherDifficulty}
                        onToggleAll={onToggleAll}
                        onLadderToggle={levels.onStationLadderToggle}
                        onDifficultyChange={levels.onStationDifficultyChange}
                        onClearToGlobal={levels.onClearToGlobal}
                        onFoldAll={onFoldAll}
                        onUnfoldAll={onUnfoldAll}
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
            </div>

            {showDetail && (
              <DetailPane
                collapsed={detailCollapsed}
                width={detailWidth}
                onWidthChange={setDetailWidth}
                onToggleCollapsed={toggleDetailCollapsed}
                display={focus.detailDisplay}
                model={model}
                relationIndex={relationIndex}
                modsByCodename={modsByCodename}
                selectionState={focus.detailSelectionState}
                onNavigateToComponent={onNavigateToComponent}
              />
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
      </div>
      )}

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <KeyboardHelp
        open={keyboardHelpOpen}
        phase={appPhase}
        onClose={() => setKeyboardHelpOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        focusField={settingsFocusField}
        onClose={() => {
          setSettingsOpen(false)
          setSettingsFocusField(null)
        }}
      />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        model={model}
        selectedIds={selectedIds}
        game={game}
      />
      <ConfirmDialog
        open={pendingSelectionReset != null}
        title="Discard selection?"
        message="Changing this will discard your current selection. Are you sure?"
        confirmLabel="Discard"
        onConfirm={confirmSelectionReset}
        onCancel={cancelSelectionReset}
      />
    </div>
  )
}
