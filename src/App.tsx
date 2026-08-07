import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import installSequenceXml from './data/InstallSequence.xml?raw'
import { parseInstallSequence } from './lib/xml/parseInstallSequence'
import {
  GAME_LABELS,
  STATION_LABELS,
  type SelectedGame,
  type StationId,
} from './lib/xml/schema'
import {
  createInitialSelection,
  displaySelectionState,
  listSelectionState,
  randomizeDisplaySubtree,
  toggleDisplayNode,
  toggleListSelection,
  type RandomizeOptions,
} from './lib/selection/selectionEngine'
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
import { downloadInstallOrder, buildInstallOrderLines } from './lib/export/installOrder'
import { type StationSlot } from './lib/ui/chromeHotkeys'
import { cycleScreen, type NavScreen } from './lib/ui/screenCycle'
import {
  findDisplayByComponentId,
  findDisplayNode,
  findPathToComponent,
} from './lib/selection/displayTreeQuery'
import { StationNav, type AppNavSlot } from './ui/StationNav'
import { EngineStation } from './ui/EngineStation'
import { ScreenNavButtons } from './ui/ScreenNavButtons'
import { ComponentTree, type TreeFoldApi } from './ui/ComponentTree'
import { ComponentDetail } from './ui/ComponentDetail'
import { ContentBranchNav } from './ui/ContentBranchNav'
import { StationListToolbar } from './ui/StationListToolbar'
import { GlobalSearchList } from './ui/GlobalSearchList'
import { GlobalSearchToolbar } from './ui/GlobalSearchToolbar'
import { FiltersStrip } from './ui/FiltersStrip'
import { SelectionPresetsBar } from './ui/SelectionPresetsBar'
import { KeyboardHelp } from './ui/KeyboardHelp'
import { RouteGuideTip } from './ui/RouteGuideTip'
import { RouteCaughtUp } from './ui/RouteCaughtUp'
import { ExportNotice } from './ui/ExportNotice'
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
import { DetailResizeHandle } from './ui/DetailResizeHandle'
import { PresetLoadNotice } from './ui/PresetLoadNotice'
import { useStationTrees } from './hooks/useStationTrees'
import { useContentBranchNav, preferredSub } from './hooks/useContentBranchNav'
import { useSelectionPresetsState } from './hooks/useSelectionPresetsState'
import { useLevelPresets } from './hooks/useLevelPresets'
import { useChromeHotkeys } from './hooks/useChromeHotkeys'
import { useAutoDismiss } from './hooks/useAutoDismiss'
import './index.css'

const parsed = parseInstallSequence(installSequenceXml)

export default function App() {
  const { model, warnings } = parsed
  const relationIndex = useMemo(() => buildRelationIndex(model), [model])
  const [game, setGame] = useState<SelectedGame | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [activeStation, setActiveStation] = useState<AppNavSlot>('engine')
  const [finishedStations, setFinishedStations] = useState<Set<StationSlot>>(
    () => new Set(),
  )
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [focusedComponentId, setFocusedComponentId] = useState<string | null>(null)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)

  const filterOptions = useMemo(() => collectFilterOptions(model), [model])
  const [filters, setFilters] = useState<FilterCriteria>(() =>
    createDefaultFilterCriteria(
      collectFilterOptions(parsed.model).tags,
      filterSeed,
    ),
  )
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false)
  const [showRouteTip, setShowRouteTip] = useState(() => !readRouteTipDismissed())
  const [railCollapsed, setRailCollapsed] = useState(() => readRailCollapsed())
  const [hideCaughtUp, setHideCaughtUp] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(() => readDetailCollapsed())
  const [detailWidth, setDetailWidth] = useState(() => readDetailWidth())
  const [exportNotice, setExportNotice] = useState<{ lineCount: number } | null>(
    null,
  )
  const foldApiRef = useRef<TreeFoldApi | null>(null)
  const onFoldApiReady = useCallback((api: TreeFoldApi | null) => {
    foldApiRef.current = api
  }, [])

  const clearFocus = useCallback(() => {
    setFocusedKey(null)
    setFocusedComponentId(null)
    setPendingFocusId(null)
  }, [])

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

  const { visibleStations, displayNodes, globalSearchHits, navigableScreens } =
    useStationTrees({
      model,
      game,
      selectedIds,
      activeStation,
      filters,
      modsByCodename,
      filterSeed,
    })

  const content = useContentBranchNav({
    activeStation,
    displayNodes,
    onClearFocus: clearFocus,
  })

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

  const stationDesc = useMemo(() => {
    if (activeStation === 'engine' || activeStation === 'search') return undefined
    const block = model.stations.find((s) => s.stationId === activeStation)
    return block?.roots.find((r) => r.attrs.desc)?.attrs.desc
  }, [activeStation, model.stations])

  const isSearchStation = activeStation === 'search'
  const {
    isContentStation,
    contentMainKey,
    contentSubKey,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
    contentMainBranches,
    contentSubBranches,
    selectedSub,
    listNodes,
    treeKey,
    selectContentMain,
    selectContentSub,
  } = content

  const filtersActive = useMemo(
    () => isFilterActive(filters, filterOptions.tags, filterSeed),
    [filters, filterOptions.tags],
  )

  const listEmptyCopy = useMemo(() => {
    if (listNodes.length > 0) return null
    if (isContentStation && contentSubBranches.length === 0) {
      return {
        title: 'No types in this bucket',
        body: 'This game branch has nothing left after filters. Clear filters or pick another Game tab.',
      }
    }
    if (isContentStation && selectedSub && listNodes.length === 0) {
      return {
        title: filtersActive ? 'Filters emptied this type' : 'Nothing in this type',
        body: filtersActive
          ? 'Clear Show levels, Size, Author, or Tags to reveal components here.'
          : 'This content type has no components for your engine. Try another Type tab.',
      }
    }
    if (filtersActive) {
      return {
        title: 'Filters emptied this stop',
        body: 'Clear filters, or broaden Show levels / Size / Author / Tags to bring components back.',
      }
    }
    return {
      title: 'Nothing on this stop',
      body: 'This station has no visible components for your engine yet — some unlock after other picks.',
    }
  }, [
    contentSubBranches.length,
    filtersActive,
    isContentStation,
    listNodes.length,
    selectedSub,
  ])

  const listCheckState = useMemo(() => {
    if (!game) return 'unchecked' as const
    return listSelectionState(listNodes, selectedIds, game)
  }, [game, listNodes, selectedIds])

  const globalSearchCheckState = useMemo(() => {
    if (!game) return 'unchecked' as const
    const checkable = globalSearchHits.filter((h) => h.checkable)
    if (checkable.length === 0) return 'unchecked' as const
    const nodes = checkable.map(
      (h) => ({ node: h.component, children: [] }) as DisplayNode,
    )
    return listSelectionState(nodes, selectedIds, game)
  }, [game, globalSearchHits, selectedIds])

  useEffect(() => {
    if (!pendingFocusId) return
    if (isContentStation) {
      const path = findPathToComponent(displayNodes, pendingFocusId)
      if (path && path.length >= 2) {
        setContentMainKey(path[0].node.key)
        setContentSubKey(path[1].node.key)
        setContentSubTag(path[1].node.tag)
        setFocusedKey(path[path.length - 1].node.key)
        setFocusedComponentId(null)
      } else if (path && path.length === 1) {
        const sub = preferredSub(path[0], contentSubTag)
        setContentMainKey(path[0].node.key)
        setContentSubKey(sub?.node.key ?? null)
        if (!contentSubTag && sub) setContentSubTag(sub.node.tag)
        setFocusedKey(path[0].node.key)
        setFocusedComponentId(null)
      }
      setPendingFocusId(null)
      return
    }
    const found = findDisplayByComponentId(displayNodes, pendingFocusId)
    if (found) {
      setFocusedKey(found.node.key)
      setFocusedComponentId(null)
    }
    setPendingFocusId(null)
  }, [
    displayNodes,
    pendingFocusId,
    isContentStation,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
  ])

  const focusedDisplay = useMemo(() => {
    if (focusedKey) {
      const fromTree = findDisplayNode(displayNodes, focusedKey)
      if (fromTree) return fromTree
    }
    if (focusedComponentId) {
      const component = model.componentsById.get(focusedComponentId)
      if (component) {
        return { node: component, children: [] } satisfies DisplayNode
      }
    }
    return null
  }, [displayNodes, focusedKey, focusedComponentId, model.componentsById])

  const focusedSelectionState = useMemo(() => {
    if (!focusedDisplay || !game) return null
    return displaySelectionState(focusedDisplay, selectedIds, game)
  }, [focusedDisplay, game, selectedIds])

  const showDetail = activeStation !== 'engine' && !!game

  function chooseGame(next: SelectedGame) {
    setGame(next)
    setSelectedIds(createInitialSelection(model, next))
    levels.resetLevelPresets()
    presets.resetPresetSelection()
    setFinishedStations(new Set())
    setActiveStation('engine')
    clearFocus()
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

  const currentFinished =
    activeStation !== 'search' && finishedStations.has(activeStation)
  const currentNavScreen = useMemo((): NavScreen | null => {
    if (activeStation === 'engine' || activeStation === 'search' || !game) return null
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
  const canMarkFinished =
    activeStation === 'search'
      ? false
      : activeStation === 'engine'
        ? !!game
        : true

  function markStationFinished() {
    if (activeStation === 'search') return
    setFinishedStations((prev) => {
      const next = new Set(prev)
      next.add(activeStation)
      return next
    })
  }

  function unmarkStationFinished() {
    if (activeStation === 'search') return
    setFinishedStations((prev) => {
      if (!prev.has(activeStation)) return prev
      const next = new Set(prev)
      next.delete(activeStation)
      return next
    })
  }

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

  function dismissRouteTip() {
    setShowRouteTip(false)
    writeRouteTipDismissed()
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
    const lineCount = buildInstallOrderLines(model, selectedIds).length
    downloadInstallOrder(model, selectedIds)
    setExportNotice({ lineCount })
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

  const clearExportNotice = useCallback(() => setExportNotice(null), [])
  useAutoDismiss(exportNotice, clearExportNotice)

  function selectEngine() {
    setActiveStation('engine')
    clearFocus()
  }

  function selectSearch() {
    setActiveStation('search')
    clearFocus()
  }

  function selectStation(id: StationId) {
    setActiveStation(id)
    clearFocus()
  }

  function onFocus(key: string) {
    setFocusedKey(key)
    setFocusedComponentId(null)
    setPendingFocusId(null)
  }

  function onFocusSearchResult(componentId: string) {
    setFocusedKey(null)
    setFocusedComponentId(componentId)
    setPendingFocusId(null)
  }

  function onNavigateToComponent(componentId: string) {
    const station = relationIndex.stationByComponentId.get(componentId)
    if (!station) return
    setFocusedKey(null)
    setFocusedComponentId(componentId)
    setPendingFocusId(componentId)
    if (activeStation !== station) {
      setActiveStation(station)
    }
  }

  function onToggle(display: DisplayNode, wantSelected: boolean) {
    if (!game) return
    setSelectedIds((prev) => toggleDisplayNode(model, prev, game, display, wantSelected))
  }

  function onRandomize(display: DisplayNode, options: RandomizeOptions) {
    if (!game) return
    setSelectedIds((prev) => randomizeDisplaySubtree(model, prev, game, display, options))
  }

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

  function onFoldAll() {
    foldApiRef.current?.foldAll()
  }

  function onUnfoldAll() {
    foldApiRef.current?.unfoldAll()
  }

  const applyStationSlot = useCallback(
    (slot: StationSlot) => {
      if (slot === 'engine') {
        setActiveStation('engine')
        clearFocus()
      } else {
        setActiveStation(slot)
        clearFocus()
      }
    },
    [clearFocus],
  )

  const openKeyboardHelp = useCallback(() => setKeyboardHelpOpen(true), [])

  useChromeHotkeys({
    keyboardHelpOpen,
    showDetail,
    activeStation,
    visibleStations,
    contentMainBranches,
    contentSubBranches,
    contentMainKey,
    contentSubKey,
    onToggleRailCollapsed: toggleRailCollapsed,
    onToggleDetailCollapsed: toggleDetailCollapsed,
    onOpenKeyboardHelp: openKeyboardHelp,
    onSelectContentMain: selectContentMain,
    onSelectContentSub: selectContentSub,
    onApplyStationSlot: applyStationSlot,
  })

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          <h1>Infinity Express</h1>
          <p>Your mod route</p>
        </div>
        <div className="top-bar-actions">
          <span className="engine-badge">
            Engine:{' '}
            <strong>{game ? GAME_LABELS[game] : 'not set'}</strong>
          </span>
          <span className="stats">{selectedIds.size} selected</span>
          <SelectionPresetsBar
            disabled={game == null}
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
          />
          <button
            type="button"
            className="btn secondary top-bar-help"
            aria-haspopup="dialog"
            aria-expanded={keyboardHelpOpen}
            title="Keyboard shortcuts"
            onClick={() => setKeyboardHelpOpen(true)}
          >
            ?
          </button>
          <button
            type="button"
            className="btn"
            disabled={selectedIds.size === 0}
            title="Download install-order.txt"
            onClick={handleExport}
          >
            Export
          </button>
        </div>
      </header>

      <div className="app-body">
        <StationNav
          game={game}
          activeStation={activeStation}
          visibleStations={visibleStations}
          finishedStations={finishedStations}
          finishedCount={routeProgress.finishedCount}
          totalCount={routeProgress.totalCount}
          collapsed={railCollapsed}
          onToggleCollapsed={toggleRailCollapsed}
          onSelectEngine={selectEngine}
          onSelectStation={selectStation}
          onSelectSearch={selectSearch}
        />

        <div className="app-main">
          {game != null && activeStation !== 'engine' && (
            <FiltersStrip
              criteria={filters}
              onChange={setFilters}
              tagOptions={filterOptions.tags}
              authorOptions={catalogAuthorOptions}
              sizeBounds={filterSeed.sizeBounds}
              onRequestTreeFocus={focusComponentTree}
              searchScope={isSearchStation ? 'global' : 'station'}
              searchPlaceholder={
                isSearchStation
                  ? 'Search all components...'
                  : 'Search in this window...'
              }
            />
          )}

          <RouteGuideTip visible={showRouteTip && !!game} onDismiss={dismissRouteTip} />
          <RouteCaughtUp
            visible={routeComplete && !hideCaughtUp && !showRouteTip}
            selectedCount={selectedIds.size}
            onExport={handleExport}
            onDismiss={() => setHideCaughtUp(true)}
          />
          <ExportNotice
            visible={exportNotice != null && !showRouteTip}
            lineCount={exportNotice?.lineCount ?? 0}
            onDismiss={() => setExportNotice(null)}
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
              {activeStation === 'engine' || !game ? (
                <div className="list-pane-scroll engine-pane-scroll">
                  <EngineStation
                    game={game}
                    onChoose={chooseGame}
                    checkedLadderLevels={levels.ladderChecked}
                    lowerDifficulty={levels.lowerDifficultyPreset}
                    higherDifficulty={levels.higherDifficultyPreset}
                    onLadderToggle={levels.onLadderToggle}
                    onDifficultyChange={levels.onDifficultyPresetChange}
                    canCycle={canCycleScreens}
                    canOk={canMarkFinished}
                    finished={currentFinished}
                    onPrevious={goPrevScreen}
                    onNext={goNextScreen}
                    onOk={onOk}
                    onCancel={unmarkStationFinished}
                  />
                </div>
              ) : isSearchStation ? (
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
                    />
                  </div>
                  <div className="list-pane-scroll">
                    <GlobalSearchList
                      hits={globalSearchHits}
                      selectedIds={selectedIds}
                      game={game}
                      focusedComponentId={focusedComponentId}
                      onFocus={onFocusSearchResult}
                      onToggle={onToggle}
                      onJump={onNavigateToComponent}
                      searchQuery={filters.search}
                      filtersActive={filtersActive}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="list-pane-header">
                    <div className="list-pane-header-title">
                      <h2>
                        {STATION_LABELS[activeStation]}
                        {currentFinished && (
                          <span className="station-finished-mark" aria-label="Finished">
                            ✓
                          </span>
                        )}
                      </h2>
                      <ScreenNavButtons
                        canCycle={canCycleScreens}
                        canOk={canMarkFinished}
                        finished={currentFinished}
                        onPrevious={goPrevScreen}
                        onNext={goNextScreen}
                        onOk={onOk}
                        onCancel={unmarkStationFinished}
                      />
                    </div>
                    {stationDesc ? (
                      <p className="lede">{stationDesc}</p>
                    ) : (
                      <p className="lede list-pane-hint">
                        Tick what you want here. Done continues the path; the rail
                        jumps anywhere.
                      </p>
                    )}
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
                    />
                    {isContentStation && (
                      <ContentBranchNav
                        mainBranches={contentMainBranches}
                        subBranches={contentSubBranches}
                        mainKey={contentMainKey}
                        subKey={contentSubKey}
                        onSelectMain={selectContentMain}
                        onSelectSub={selectContentSub}
                      />
                    )}
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
                      focusedKey={focusedKey}
                      onFocus={onFocus}
                      onToggle={onToggle}
                      onRandomize={onRandomize}
                      onFoldApiReady={onFoldApiReady}
                      emptyTitle={listEmptyCopy?.title}
                      emptyBody={listEmptyCopy?.body}
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

            {showDetail && !detailCollapsed && (
              <DetailResizeHandle
                width={detailWidth}
                onWidthChange={setDetailWidth}
              />
            )}

            {showDetail && (
              <aside
                className={`detail-pane${detailCollapsed ? ' collapsed' : ''}`}
                aria-label="Component details"
              >
                {detailCollapsed ? (
                  <button
                    type="button"
                    className="detail-pane-expand"
                    onClick={toggleDetailCollapsed}
                    title="Show details (;)"
                    aria-expanded={false}
                  >
                    <span className="detail-pane-expand-label">Details</span>
                  </button>
                ) : (
                  <>
                    <div className="detail-pane-chrome">
                      <span className="detail-pane-chrome-label">Details</span>
                      <button
                        type="button"
                        className="detail-pane-collapse"
                        onClick={toggleDetailCollapsed}
                        title="Hide details (;)"
                        aria-expanded={true}
                        aria-label="Hide details"
                      >
                        »
                      </button>
                    </div>
                    <div className="detail-pane-scroll">
                      <ComponentDetail
                        display={focusedDisplay}
                        model={model}
                        relationIndex={relationIndex}
                        modsByCodename={modsByCodename}
                        selectionState={focusedSelectionState}
                        onNavigateToComponent={onNavigateToComponent}
                      />
                    </div>
                  </>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>

      <KeyboardHelp
        open={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />
    </div>
  )
}
