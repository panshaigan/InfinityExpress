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
  type ComponentNode,
  type TreeNode,
} from './lib/xml/schema'
import {
  applyLadderLevelSelection,
  createInitialSelection,
  setDifficultySelection,
  toggleNode,
} from './lib/selection/selectionEngine'
import type { LadderLevel } from './lib/levels'
import {
  buildDisplayTree,
  displayTreeHasVisible,
  type DisplayNode,
} from './lib/selection/visibility'
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
import { FiltersStrip } from './ui/FiltersStrip'
import { LevelSelectStrip } from './ui/LevelSelectStrip'
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
  const [ladderPreset, setLadderPreset] = useState<LadderLevel | null>(null)
  const [difficultyPreset, setDifficultyPreset] = useState(false)

  const visibleStations = useMemo(() => {
    if (!game) return [] as StationId[]
    return STATION_ORDER.filter((id) => {
      const block = model.stations.find((s) => s.stationId === id)
      if (!block) return false
      return displayTreeHasVisible(block.children, { game, selectedIds })
    })
  }, [game, model.stations, selectedIds])

  const displayNodes = useMemo(() => {
    if (!game || activeStation === 'engine') return []
    const block = model.stations.find((s) => s.stationId === activeStation)
    if (!block) return []
    const includeHidden = filtersNeedIncludeHidden(filters)
    const built = buildDisplayTree(block.children, { game, selectedIds, includeHidden })
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

  useEffect(() => {
    if (!pendingFocusId) return
    const found = findDisplayByComponentId(displayNodes, pendingFocusId)
    if (found) {
      setFocusedKey(found.node.key)
      setFocusedComponentId(null)
    }
    setPendingFocusId(null)
  }, [displayNodes, pendingFocusId])

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

  function chooseGame(next: SelectedGame) {
    setGame(next)
    setSelectedIds(createInitialSelection(model, next))
    setLadderPreset(null)
    setDifficultyPreset(false)
    setActiveStation('base')
    clearFocus()
  }

  function onLadderPresetChange(level: LadderLevel | null) {
    if (!game) return
    setLadderPreset(level)
    setSelectedIds((prev) => applyLadderLevelSelection(model, prev, game, level))
  }

  function onDifficultyPresetChange(want: boolean) {
    if (!game) return
    setDifficultyPreset(want)
    setSelectedIds((prev) => setDifficultySelection(model, prev, game, want))
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

  function onToggle(
    node: TreeNode,
    collapsedComponent: ComponentNode | undefined,
    wantSelected: boolean,
  ) {
    if (!game) return
    setSelectedIds((prev) => toggleNode(model, prev, game, node, collapsedComponent, wantSelected))
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

      <StationNav
        game={game}
        activeStation={activeStation}
        visibleStations={visibleStations}
        onSelectEngine={selectEngine}
        onSelectStation={selectStation}
      />

      <LevelSelectStrip
        enabled={!!game}
        ladder={ladderPreset}
        difficulty={difficultyPreset}
        onLadderChange={onLadderPresetChange}
        onDifficultyChange={onDifficultyPresetChange}
      />

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
              <EngineStation game={game} onChoose={chooseGame} />
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
              </div>
              <div className="list-pane-scroll">
                <ComponentTree
                  key={activeStation}
                  nodes={displayNodes}
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
  )
}
