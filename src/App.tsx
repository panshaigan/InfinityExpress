import { useEffect, useMemo, useState } from 'react'
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
  applyLadderLevelSelection,
  createInitialSelection,
  setDifficultySelection,
  toggleDisplayNode,
} from './lib/selection/selectionEngine'
import { LADDER_LEVELS, type LadderLevel } from './lib/levels'
import {
  buildDisplayTree,
  displayTreeHasVisible,
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
import { buildRelationIndex } from './lib/selection/relations'
import { downloadInstallOrder } from './lib/export/installOrder'
import { StationNav } from './ui/StationNav'
import { EngineStation } from './ui/EngineStation'
import { ComponentTree } from './ui/ComponentTree'
import { ComponentDetail } from './ui/ComponentDetail'
import { ContentBranchNav } from './ui/ContentBranchNav'
import { FiltersStrip } from './ui/FiltersStrip'
import { sortContentSubBranches } from './lib/contentBranchOrder'
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

export default function App() {
  const { model, warnings } = parsed
  const relationIndex = useMemo(() => buildRelationIndex(model), [model])
  const [game, setGame] = useState<SelectedGame | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [activeStation, setActiveStation] = useState<'engine' | StationId>('engine')
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
  const [difficultyPreset, setDifficultyPreset] = useState(false)
  const [contentMainKey, setContentMainKey] = useState<string | null>(null)
  const [contentSubKey, setContentSubKey] = useState<string | null>(null)
  const [contentSubTag, setContentSubTag] = useState<string | null>(null)

  const visibleStations = useMemo(() => {
    if (!game) return [] as StationId[]
    return STATION_ORDER.filter((id) => {
      const block = model.stations.find((s) => s.stationId === id)
      if (!block) return false
      const stationChildren =
        block.stationId === 'content' ? remapContentForGame(block.children, game) : block.children
      return displayTreeHasVisible(stationChildren, { game, selectedIds })
    })
  }, [game, model.stations, selectedIds])

  const displayNodes = useMemo(() => {
    if (!game || activeStation === 'engine') return []
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
    )
  }, [activeStation, filters, game, model, selectedIds])

  const stationDesc = useMemo(() => {
    if (activeStation === 'engine') return undefined
    const block = model.stations.find((s) => s.stationId === activeStation)
    return block?.roots.find((r) => r.attrs.desc)?.attrs.desc
  }, [activeStation, model.stations])

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
    setDifficultyPreset(false)
    setActiveStation('engine')
    clearFocus()
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

      setSelectedIds((prevSelected) =>
        applyLadderLevelSelection(model, prevSelected, game, next),
      )
      return next
    })
  }

  function onDifficultyPresetChange(want: boolean) {
    if (!game) return
    setDifficultyPreset(want)
    setSelectedIds((prev) => setDifficultySelection(model, prev, game, want))
  }

  function onCustomize() {
    setActiveStation('base')
    clearFocus()
  }

  function selectEngine() {
    setActiveStation('engine')
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
          onSelectEngine={selectEngine}
          onSelectStation={selectStation}
        />

        <div className="app-main">
          <FiltersStrip
            criteria={filters}
            onChange={setFilters}
            tagOptions={filterOptions.tags}
            stabilityOptions={filterOptions.stabilities}
            authorOptions={catalogAuthorOptions}
            sizeBounds={catalogSizeBounds}
          />

          <div className={`workspace${showDetail ? '' : ' engine-only'}`}>
            <div className="list-pane">
              {activeStation === 'engine' || !game ? (
                <div className="list-pane-scroll">
                  <EngineStation
                    game={game}
                    onChoose={chooseGame}
                    checkedLadderLevels={ladderChecked}
                    difficulty={difficultyPreset}
                    onLadderToggle={onLadderToggle}
                    onDifficultyChange={onDifficultyPresetChange}
                    onCustomize={onCustomize}
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
              ) : (
                <>
                  <div className="list-pane-header">
                    <h2>{STATION_LABELS[activeStation]}</h2>
                    <p className="lede">
                      {stationDesc ?? 'Tick what you want on this stop. Switch stations anytime.'}
                    </p>
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
                      key={
                        isContentStation
                          ? `${activeStation}:${contentMainKey ?? ''}:${contentSubKey ?? ''}`
                          : activeStation
                      }
                      nodes={listNodes}
                      selectedIds={selectedIds}
                      game={game}
                      focusedKey={focusedKey}
                      onFocus={onFocus}
                      onToggle={onToggle}
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
