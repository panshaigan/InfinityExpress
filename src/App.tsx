import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import installSequenceXml from './data/InstallSequence.xml?raw'
import modsCsv from './data/mods.csv?raw'
import { parseInstallSequence } from './lib/xml/parseInstallSequence'
import {
  GAME_LABELS,
  STATION_LABELS,
  STATION_ORDER,
  type SelectedGame,
  type StationId,
} from './lib/xml/schema'
import {
  applyGlobalLevelBaseline,
  applyLadderLevelSelection,
  createInitialSelection,
  listSelectionState,
  randomizeDisplaySubtree,
  setDifficultySelection,
  toggleDisplayNode,
  toggleListSelection,
  type RandomizeOptions,
} from './lib/selection/selectionEngine'
import { LADDER_LEVELS, type LadderLevel } from './lib/levels'
import {
  buildDisplayTree,
  displayTreeHasVisible,
  stationRootsAllowDisplay,
  type DisplayNode,
} from './lib/selection/visibility'
import { remapContentForGame } from './lib/xml/remapContentForGame'
import {
  collectFilterOptions,
  createDefaultFilterCriteria,
  filterDisplayTree,
  filtersNeedIncludeHidden,
  type FilterCriteria,
} from './lib/selection/filterDisplayTree'
import {
  collectAuthorOptions,
  modSizeBounds,
  parseModsCsv,
} from './lib/mods/loadMods'
import { buildRelationIndex, componentIdsForStation } from './lib/selection/relations'
import { downloadInstallOrder } from './lib/export/installOrder'
import {
  cycleStation,
  cycleTabIndex,
  isTypingTarget,
  resolveChromeHotkey,
  stationCycleOrder,
  type StationSlot,
} from './lib/ui/chromeHotkeys'
import {
  buildNavigableScreens,
  cycleScreen,
  type NavScreen,
} from './lib/ui/screenCycle'
import {
  buildGlobalSearchResults,
} from './lib/selection/globalSearch'
import { StationNav, type AppNavSlot } from './ui/StationNav'
import { EngineStation } from './ui/EngineStation'
import { ScreenNavButtons } from './ui/ScreenNavButtons'
import { ComponentTree, type TreeFoldApi } from './ui/ComponentTree'
import { ComponentDetail } from './ui/ComponentDetail'
import { ContentBranchNav } from './ui/ContentBranchNav'
import { StationListToolbar } from './ui/StationListToolbar'
import { GlobalSearchList } from './ui/GlobalSearchList'
import { GlobalSearchToolbar } from './ui/GlobalSearchToolbar'
import { FILTERS_SEARCH_ID, FiltersStrip } from './ui/FiltersStrip'
import { SelectionPresetsBar } from './ui/SelectionPresetsBar'
import { sortContentSubBranches } from './lib/contentBranchOrder'
import {
  applySelectionPreset,
  autoPresetName,
  fingerprintFromLive,
  fingerprintFromPreset,
  newPresetId,
  presetsForGame,
  snapshotSelectionPreset,
  uniquePresetName,
  type SelectionPreset,
} from './lib/presets/selectionPresets'
import './index.css'

const parsed = parseInstallSequence(installSequenceXml)
const modsByCodename = parseModsCsv(modsCsv)
const catalogSizeBounds = modSizeBounds(modsByCodename)
const catalogAuthorOptions = collectAuthorOptions(modsByCodename, 3)
const catalogAuthorNames = catalogAuthorOptions.map((a) => a.name)
const filterSeed = {
  authorOptions: catalogAuthorNames,
  sizeBounds: catalogSizeBounds,
}

function findDisplayNode(nodes: DisplayNode[], key: string): DisplayNode | null {
  for (const n of nodes) {
    if (n.node.key === key) return n
    const found = findDisplayNode(n.children, key)
    if (found) return found
  }
  return null
}

function findDisplayByComponentId(
  nodes: DisplayNode[],
  componentId: string,
): DisplayNode | null {
  for (const n of nodes) {
    if (n.collapsedComponent?.componentId === componentId) return n
    if (n.node.kind === 'component' && n.node.componentId === componentId) return n
    const found = findDisplayByComponentId(n.children, componentId)
    if (found) return found
  }
  return null
}

/** Path from a content main branch down to the node that owns `componentId`. */
function findPathToComponent(
  nodes: DisplayNode[],
  componentId: string,
  path: DisplayNode[] = [],
): DisplayNode[] | null {
  for (const n of nodes) {
    const next = [...path, n]
    if (n.collapsedComponent?.componentId === componentId) return next
    if (n.node.kind === 'component' && n.node.componentId === componentId) return next
    const found = findPathToComponent(n.children, componentId, next)
    if (found) return found
  }
  return null
}

function preferredSub(main: DisplayNode, preferredTag: string | null): DisplayNode | null {
  const ordered = sortContentSubBranches(main.children)
  if (preferredTag) {
    const match = ordered.find((c) => c.node.tag === preferredTag)
    if (match) return match
  }
  return ordered[0] ?? null
}

interface StationLevelPreset {
  ladder: Set<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
}

function emptyStationPreset(): StationLevelPreset {
  return { ladder: new Set(), lowerDifficulty: false, higherDifficulty: false }
}

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
  const [ladderChecked, setLadderChecked] = useState<Set<LadderLevel>>(() => new Set())
  const [lowerDifficultyPreset, setLowerDifficultyPreset] = useState(false)
  const [higherDifficultyPreset, setHigherDifficultyPreset] = useState(false)
  /** Last Engine-applied baseline; used by station “Reset to global”. */
  const [lastGlobalLadder, setLastGlobalLadder] = useState<Set<LadderLevel>>(() => new Set())
  const [lastGlobalLowerDifficulty, setLastGlobalLowerDifficulty] = useState(false)
  const [lastGlobalHigherDifficulty, setLastGlobalHigherDifficulty] = useState(false)
  const [stationLevelPresets, setStationLevelPresets] = useState(
    () => new Map<StationId, StationLevelPreset>(),
  )
  const [selectionPresets, setSelectionPresets] = useState<SelectionPreset[]>(() => [])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [presetBaseline, setPresetBaseline] = useState<string | null>(null)
  const [contentMainKey, setContentMainKey] = useState<string | null>(null)
  const [contentSubKey, setContentSubKey] = useState<string | null>(null)
  const [contentSubTag, setContentSubTag] = useState<string | null>(null)
  const foldApiRef = useRef<TreeFoldApi | null>(null)
  const onFoldApiReady = useCallback((api: TreeFoldApi | null) => {
    foldApiRef.current = api
  }, [])

  const visibleStations = useMemo(() => {
    if (!game) return [] as StationId[]
    return STATION_ORDER.filter((id) => {
      const block = model.stations.find((s) => s.stationId === id)
      if (!block) return false
      const ctx = { game, selectedIds }
      if (!stationRootsAllowDisplay(block.roots, ctx)) return false
      const stationChildren =
        block.stationId === 'content' ? remapContentForGame(block.children, game) : block.children
      return displayTreeHasVisible(stationChildren, ctx)
    })
  }, [game, model.stations, selectedIds])

  const displayNodes = useMemo(() => {
    if (!game || activeStation === 'engine' || activeStation === 'search') return []
    const block = model.stations.find((s) => s.stationId === activeStation)
    if (!block) return []
    const includeHidden = filtersNeedIncludeHidden(filters)
    const stationChildren =
      block.stationId === 'content' ? remapContentForGame(block.children, game) : block.children
    const built = buildDisplayTree(stationChildren, { game, selectedIds, includeHidden })
    return filterDisplayTree(
      built,
      filters,
      { model, modsByCodename },
      filterSeed,
      { selectedIds, game },
    )
  }, [activeStation, filters, game, model, modsByCodename, selectedIds])

  const globalSearchHits = useMemo(() => {
    if (!game || activeStation !== 'search') return []
    return buildGlobalSearchResults(
      model,
      game,
      selectedIds,
      filters,
      { model, modsByCodename },
      filterSeed,
      { selectedIds, game },
    )
  }, [activeStation, filters, game, model, modsByCodename, selectedIds])

  const navigableScreens = useMemo(() => {
    if (!game) return [] as NavScreen[]
    const includeHidden = filtersNeedIncludeHidden(filters)
    return buildNavigableScreens(visibleStations, (id) => {
      const block = model.stations.find((s) => s.stationId === id)
      if (!block) return []
      const stationChildren =
        id === 'content' ? remapContentForGame(block.children, game) : block.children
      const built = buildDisplayTree(stationChildren, { game, selectedIds, includeHidden })
      return filterDisplayTree(
        built,
        filters,
        { model, modsByCodename },
        filterSeed,
        { selectedIds, game },
      )
    })
  }, [filters, game, model, modsByCodename, selectedIds, visibleStations])

  const stationDesc = useMemo(() => {
    if (activeStation === 'engine' || activeStation === 'search') return undefined
    const block = model.stations.find((s) => s.stationId === activeStation)
    return block?.roots.find((r) => r.attrs.desc)?.attrs.desc
  }, [activeStation, model.stations])

  const isSearchStation = activeStation === 'search'
  const isContentStation = activeStation === 'content'
  const contentMainBranches = isContentStation ? displayNodes : []
  const selectedMain = useMemo(() => {
    if (!contentMainKey) return null
    return contentMainBranches.find((b) => b.node.key === contentMainKey) ?? null
  }, [contentMainBranches, contentMainKey])
  const contentSubBranches = useMemo(
    () => sortContentSubBranches(selectedMain?.children ?? []),
    [selectedMain],
  )
  const selectedSub = useMemo(() => {
    if (!contentSubKey) return null
    return contentSubBranches.find((b) => b.node.key === contentSubKey) ?? null
  }, [contentSubBranches, contentSubKey])
  const listNodes = isContentStation ? (selectedSub?.children ?? []) : displayNodes
  const treeKey = isContentStation
    ? `${activeStation}:${contentMainKey ?? ''}:${contentSubKey ?? ''}`
    : activeStation
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

  const activeStationPreset =
    activeStation === 'engine' || activeStation === 'search'
      ? emptyStationPreset()
      : (stationLevelPresets.get(activeStation) ?? emptyStationPreset())

  const gamePresets = useMemo(
    () => (game ? presetsForGame(selectionPresets, game) : []),
    [game, selectionPresets],
  )
  const activePreset = useMemo(
    () =>
      activePresetId != null
        ? selectionPresets.find((p) => p.id === activePresetId) ?? null
        : null,
    [activePresetId, selectionPresets],
  )
  const liveFingerprint = useMemo(() => {
    if (!game) return null
    return fingerprintFromLive({
      game,
      selectedIds,
      ladderChecked,
      lowerDifficulty: lowerDifficultyPreset,
      higherDifficulty: higherDifficultyPreset,
      lastGlobalLadder,
      lastGlobalLowerDifficulty,
      lastGlobalHigherDifficulty,
      stationLevelPresets,
    })
  }, [
    game,
    selectedIds,
    ladderChecked,
    lowerDifficultyPreset,
    higherDifficultyPreset,
    lastGlobalLadder,
    lastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty,
    stationLevelPresets,
  ])
  const presetDirty =
    activePresetId != null &&
    presetBaseline != null &&
    liveFingerprint != null &&
    liveFingerprint !== presetBaseline

  useEffect(() => {
    if (!isContentStation) return
    const mainValid =
      contentMainKey != null &&
      contentMainBranches.some((b) => b.node.key === contentMainKey)
    const main = mainValid
      ? contentMainBranches.find((b) => b.node.key === contentMainKey)!
      : contentMainBranches[0]
    if (!main) {
      if (contentMainKey != null) setContentMainKey(null)
      if (contentSubKey != null) setContentSubKey(null)
      return
    }
    if (!mainValid) {
      const sub = preferredSub(main, contentSubTag)
      setContentMainKey(main.node.key)
      setContentSubKey(sub?.node.key ?? null)
      if (!contentSubTag && sub) setContentSubTag(sub.node.tag)
      return
    }
    const subValid =
      contentSubKey != null &&
      main.children.some((b) => b.node.key === contentSubKey)
    if (!subValid) {
      const sub = preferredSub(main, contentSubTag)
      setContentSubKey(sub?.node.key ?? null)
      if (!contentSubTag && sub) setContentSubTag(sub.node.tag)
    }
  }, [isContentStation, contentMainBranches, contentMainKey, contentSubKey, contentSubTag])

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
  }, [displayNodes, pendingFocusId, isContentStation, contentSubTag])

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

  const showDetail = activeStation !== 'engine' && !!game

  function clearFocus() {
    setFocusedKey(null)
    setFocusedComponentId(null)
    setPendingFocusId(null)
  }

  function selectContentMain(key: string) {
    const main = contentMainBranches.find((b) => b.node.key === key)
    const sub = main ? preferredSub(main, contentSubTag) : null
    setContentMainKey(key)
    setContentSubKey(sub?.node.key ?? null)
    clearFocus()
  }

  function selectContentSub(key: string) {
    const sub = contentSubBranches.find((b) => b.node.key === key)
    setContentSubKey(key)
    if (sub) setContentSubTag(sub.node.tag)
    clearFocus()
  }

  function chooseGame(next: SelectedGame) {
    setGame(next)
    setSelectedIds(createInitialSelection(model, next))
    setLadderChecked(new Set())
    setLowerDifficultyPreset(false)
    setHigherDifficultyPreset(false)
    setLastGlobalLadder(new Set())
    setLastGlobalLowerDifficulty(false)
    setLastGlobalHigherDifficulty(false)
    setStationLevelPresets(new Map())
    setActivePresetId(null)
    setPresetBaseline(null)
    setFinishedStations(new Set())
    setActiveStation('engine')
    clearFocus()
  }

  function livePresetInput(forGame: SelectedGame) {
    return {
      game: forGame,
      selectedIds,
      ladderChecked,
      lowerDifficulty: lowerDifficultyPreset,
      higherDifficulty: higherDifficultyPreset,
      lastGlobalLadder,
      lastGlobalLowerDifficulty,
      lastGlobalHigherDifficulty,
      stationLevelPresets,
    }
  }

  function saveSelectionPreset() {
    if (!game) return
    const input = livePresetInput(game)
    const active =
      activePresetId != null
        ? selectionPresets.find((p) => p.id === activePresetId && p.game === game)
        : undefined
    if (active) {
      const updated = snapshotSelectionPreset(active.id, active.name, input)
      setSelectionPresets((prev) => prev.map((p) => (p.id === active.id ? updated : p)))
      setPresetBaseline(fingerprintFromPreset(updated))
      return
    }
    const names = presetsForGame(selectionPresets, game).map((p) => p.name)
    const name = uniquePresetName(autoPresetName(game, selectedIds.size), names)
    const created = snapshotSelectionPreset(newPresetId(), name, input)
    setSelectionPresets((prev) => [...prev, created])
    setActivePresetId(created.id)
    setPresetBaseline(fingerprintFromPreset(created))
  }

  function loadSelectionPreset(id: string | null) {
    if (id == null) {
      setActivePresetId(null)
      setPresetBaseline(null)
      return
    }
    if (!game) return
    const preset = selectionPresets.find((p) => p.id === id && p.game === game)
    if (!preset) return
    const applied = applySelectionPreset(preset)
    setSelectedIds(applied.selectedIds)
    setLadderChecked(applied.ladderChecked)
    setLowerDifficultyPreset(applied.lowerDifficulty)
    setHigherDifficultyPreset(applied.higherDifficulty)
    setLastGlobalLadder(applied.lastGlobalLadder)
    setLastGlobalLowerDifficulty(applied.lastGlobalLowerDifficulty)
    setLastGlobalHigherDifficulty(applied.lastGlobalHigherDifficulty)
    setStationLevelPresets(() => {
      const next = new Map<StationId, StationLevelPreset>()
      for (const [key, value] of applied.stationLevelPresets) {
        next.set(key as StationId, value)
      }
      return next
    })
    setActivePresetId(preset.id)
    setPresetBaseline(fingerprintFromPreset(preset))
  }

  function renameSelectionPreset(name: string) {
    if (!activePresetId || !game) return
    setSelectionPresets((prev) => {
      const current = prev.find((p) => p.id === activePresetId)
      if (!current) return prev
      const others = presetsForGame(prev, game)
        .filter((p) => p.id !== activePresetId)
        .map((p) => p.name)
      const unique = uniquePresetName(name, others)
      return prev.map((p) => (p.id === activePresetId ? { ...p, name: unique } : p))
    })
  }

  function deleteSelectionPreset() {
    if (!activePresetId) return
    setSelectionPresets((prev) => prev.filter((p) => p.id !== activePresetId))
    setActivePresetId(null)
    setPresetBaseline(null)
  }

  function onLadderToggle(level: LadderLevel, wantChecked: boolean) {
    if (!game) return
    setLadderChecked((prev) => {
      const next = new Set(prev)

      const idx = LADDER_LEVELS.indexOf(level)
      if (idx === -1) return prev

      if (wantChecked) {
        // Enable the previous ladder ranks too (prefix), but allow unchecking later.
        for (let i = 0; i <= idx; i++) next.add(LADDER_LEVELS[i]!)
      } else {
        next.delete(level)
      }

      setLastGlobalLadder(new Set(next))
      setSelectedIds((prevSelected) =>
        applyLadderLevelSelection(model, prevSelected, game, next),
      )
      return next
    })
  }

  function onDifficultyPresetChange(
    token: 'lowerDifficulty' | 'higherDifficulty',
    want: boolean,
  ) {
    if (!game) return
    if (token === 'lowerDifficulty') {
      setLowerDifficultyPreset(want)
      setLastGlobalLowerDifficulty(want)
    } else {
      setHigherDifficultyPreset(want)
      setLastGlobalHigherDifficulty(want)
    }
    setSelectedIds((prev) => setDifficultySelection(model, prev, game, token, want))
  }

  function onStationLadderToggle(level: LadderLevel, wantChecked: boolean) {
    if (!game || activeStation === 'engine' || activeStation === 'search') return
    const stationId = activeStation
    const scope = componentIdsForStation(relationIndex.stationByComponentId, stationId)
    setStationLevelPresets((prev) => {
      const current = prev.get(stationId) ?? emptyStationPreset()
      const nextLadder = new Set(current.ladder)
      const idx = LADDER_LEVELS.indexOf(level)
      if (idx === -1) return prev
      if (wantChecked) {
        for (let i = 0; i <= idx; i++) nextLadder.add(LADDER_LEVELS[i]!)
      } else {
        nextLadder.delete(level)
      }
      const next = new Map(prev)
      next.set(stationId, {
        ladder: nextLadder,
        lowerDifficulty: current.lowerDifficulty,
        higherDifficulty: current.higherDifficulty,
      })
      setSelectedIds((prevSelected) =>
        applyLadderLevelSelection(model, prevSelected, game, nextLadder, scope),
      )
      return next
    })
  }

  function onStationDifficultyChange(
    token: 'lowerDifficulty' | 'higherDifficulty',
    want: boolean,
  ) {
    if (!game || activeStation === 'engine' || activeStation === 'search') return
    const stationId = activeStation
    const scope = componentIdsForStation(relationIndex.stationByComponentId, stationId)
    setStationLevelPresets((prev) => {
      const current = prev.get(stationId) ?? emptyStationPreset()
      const next = new Map(prev)
      next.set(stationId, {
        ladder: current.ladder,
        lowerDifficulty:
          token === 'lowerDifficulty' ? want : current.lowerDifficulty,
        higherDifficulty:
          token === 'higherDifficulty' ? want : current.higherDifficulty,
      })
      return next
    })
    setSelectedIds((prev) => setDifficultySelection(model, prev, game, token, want, scope))
  }

  function onClearToGlobal() {
    if (!game || activeStation === 'engine' || activeStation === 'search') return
    const stationId = activeStation
    const scope = componentIdsForStation(relationIndex.stationByComponentId, stationId)
    setSelectedIds((prev) =>
      applyGlobalLevelBaseline(
        model,
        prev,
        game,
        lastGlobalLadder,
        lastGlobalLowerDifficulty,
        lastGlobalHigherDifficulty,
        scope,
      ),
    )
    setStationLevelPresets((prev) => {
      const next = new Map(prev)
      next.set(stationId, {
        ladder: new Set(lastGlobalLadder),
        lowerDifficulty: lastGlobalLowerDifficulty,
        higherDifficulty: lastGlobalHigherDifficulty,
      })
      return next
    })
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

  /** Mark current station finished, then advance past it to the next unfinished screen. */
  function onOk() {
    if (!canMarkFinished) return
    markStationFinished()
    const next = cycleScreen(
      navigableScreens,
      currentNavScreen,
      1,
      (s) => finishedStations.has(s.stationId) || s.stationId === activeStation,
    )
    if (next) applyNavScreen(next)
  }

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

  function focusFiltersSearch() {
    const el = document.getElementById(FILTERS_SEARCH_ID) as HTMLInputElement | null
    if (!el) return
    el.focus()
    el.select()
  }

  function applyStationSlot(slot: StationSlot) {
    if (slot === 'engine') selectEngine()
    else selectStation(slot)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
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
        const cycleFrom: StationSlot =
          activeStation === 'search' ? 'engine' : activeStation
        const next = cycleStation(order, cycleFrom, cmd.direction)
        if (next) applyStationSlot(next)
        return
      }

      if (cmd.type === 'cycleContentMain') {
        if (contentMainBranches.length === 0) return
        e.preventDefault()
        const keys = contentMainBranches.map((b) => b.node.key)
        const currentIndex = contentMainKey != null ? keys.indexOf(contentMainKey) : 0
        const next = cycleTabIndex(keys.length, currentIndex, cmd.direction)
        const nextKey = keys[next]
        if (nextKey) selectContentMain(nextKey)
        return
      }

      if (cmd.type === 'cycleContentSub') {
        if (contentSubBranches.length === 0) return
        e.preventDefault()
        const keys = contentSubBranches.map((b) => b.node.key)
        const currentIndex = contentSubKey != null ? keys.indexOf(contentSubKey) : 0
        const next = cycleTabIndex(keys.length, currentIndex, cmd.direction)
        const nextKey = keys[next]
        if (nextKey) selectContentSub(nextKey)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeStation,
    visibleStations,
    contentMainBranches,
    contentSubBranches,
    contentMainKey,
    contentSubKey,
    contentSubTag,
  ])

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          <h1>Infinity Express</h1>
          <p>Mod route planner</p>
        </div>
        <div className="top-bar-actions">
          <span className="engine-badge">
            Engine:{' '}
            <strong>{game ? GAME_LABELS[game] : 'not set'}</strong>
          </span>
          <span className="stats">{selectedIds.size} selected</span>
          <SelectionPresetsBar
            disabled={game == null}
            presets={gamePresets.map((p) => ({ id: p.id, name: p.name }))}
            activePresetId={activePreset?.game === game ? activePresetId : null}
            activePresetName={
              activePreset?.game === game ? activePreset.name : null
            }
            dirty={presetDirty}
            canSave={game != null && (activePresetId == null || presetDirty)}
            canDelete={activePreset != null && activePreset.game === game}
            onSelectPreset={loadSelectionPreset}
            onSave={saveSelectionPreset}
            onRename={renameSelectionPreset}
            onDelete={deleteSelectionPreset}
          />
          <button
            type="button"
            className="btn"
            disabled={selectedIds.size === 0}
            onClick={() => downloadInstallOrder(model, selectedIds)}
          >
            Export install order
          </button>
        </div>
      </header>

      <div className="app-body">
        <StationNav
          game={game}
          activeStation={activeStation}
          visibleStations={visibleStations}
          finishedStations={finishedStations}
          onSelectEngine={selectEngine}
          onSelectSearch={selectSearch}
          onSelectStation={selectStation}
        />

        <div className="app-main">
          <FiltersStrip
            criteria={filters}
            onChange={setFilters}
            tagOptions={filterOptions.tags}
            authorOptions={catalogAuthorOptions}
            sizeBounds={catalogSizeBounds}
            onRequestTreeFocus={focusComponentTree}
            searchPlaceholder={
              isSearchStation
                ? 'Search all components...'
                : 'Search in this window...'
            }
          />

          <div className={`workspace${showDetail ? '' : ' engine-only'}`}>
            <div className="list-pane">
              {activeStation === 'engine' || !game ? (
                <div className="list-pane-scroll">
                  <EngineStation
                    game={game}
                    onChoose={chooseGame}
                    checkedLadderLevels={ladderChecked}
                    lowerDifficulty={lowerDifficultyPreset}
                    higherDifficulty={higherDifficultyPreset}
                    onLadderToggle={onLadderToggle}
                    onDifficultyChange={onDifficultyPresetChange}
                    canCycle={canCycleScreens}
                    canOk={canMarkFinished}
                    finished={currentFinished}
                    onPrevious={goPrevScreen}
                    onNext={goNextScreen}
                    onOk={onOk}
                    onCancel={unmarkStationFinished}
                  />
                  {warnings.length > 0 && (
                    <details className="warnings">
                      <summary>{warnings.length} parse warnings</summary>
                      <ul>
                        {warnings.slice(0, 30).map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ) : isSearchStation ? (
                <>
                  <div className="list-pane-header">
                    <div className="list-pane-header-title">
                      <h2>Search</h2>
                    </div>
                    <p className="lede">
                      Find any eligible component across stations. Gated options
                      stay listed but cannot be checked until unlocked.
                    </p>
                    <GlobalSearchToolbar
                      resultCount={globalSearchHits.length}
                      checkableCount={
                        globalSearchHits.filter((h) => h.checkable).length
                      }
                      listState={globalSearchCheckState}
                      onToggleAll={onToggleAllSearch}
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
                    <p className="lede">
                      {stationDesc ?? 'Tick what you want on this stop. Switch stations anytime.'}
                    </p>
                    <StationListToolbar
                      listNodes={listNodes}
                      listState={listCheckState}
                      checkedLadderLevels={activeStationPreset.ladder}
                      lowerDifficulty={activeStationPreset.lowerDifficulty}
                      higherDifficulty={activeStationPreset.higherDifficulty}
                      onToggleAll={onToggleAll}
                      onLadderToggle={onStationLadderToggle}
                      onDifficultyChange={onStationDifficultyChange}
                      onClearToGlobal={onClearToGlobal}
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
                    />
                    {warnings.length > 0 && (
                      <details className="warnings">
                        <summary>{warnings.length} parse warnings</summary>
                        <ul>
                          {warnings.slice(0, 30).map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </>
              )}
            </div>

            {showDetail && (
              <aside className="detail-pane" aria-label="Component details">
                <div className="detail-pane-scroll">
                  <ComponentDetail
                    display={focusedDisplay}
                    model={model}
                    onNavigateToComponent={onNavigateToComponent}
                  />
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
