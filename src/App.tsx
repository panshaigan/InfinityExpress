import { useMemo, useState } from 'react'
import installSequenceXml from './data/InstallSequence.xml?raw'
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
import { createInitialSelection, toggleNode } from './lib/selection/selectionEngine'
import {
  buildDisplayTree,
  displayTreeHasVisible,
  type DisplayNode,
} from './lib/selection/visibility'
import { downloadInstallOrder } from './lib/export/installOrder'
import { StationNav } from './ui/StationNav'
import { EngineStation } from './ui/EngineStation'
import { ComponentTree } from './ui/ComponentTree'
import { ComponentDetail } from './ui/ComponentDetail'
import './index.css'

const parsed = parseInstallSequence(installSequenceXml)

function findDisplayNode(nodes: DisplayNode[], key: string): DisplayNode | null {
  for (const n of nodes) {
    if (n.node.key === key) return n
    const found = findDisplayNode(n.children, key)
    if (found) return found
  }
  return null
}

export default function App() {
  const { model, warnings } = parsed
  const [game, setGame] = useState<SelectedGame | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [activeStation, setActiveStation] = useState<'engine' | StationId>('engine')
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

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
    return buildDisplayTree(block.children, { game, selectedIds })
  }, [activeStation, game, model.stations, selectedIds])

  const stationDesc = useMemo(() => {
    if (activeStation === 'engine') return undefined
    const block = model.stations.find((s) => s.stationId === activeStation)
    return block?.roots.find((r) => r.attrs.desc)?.attrs.desc
  }, [activeStation, model.stations])

  const focusedDisplay = useMemo(() => {
    if (!focusedKey) return null
    return findDisplayNode(displayNodes, focusedKey)
  }, [displayNodes, focusedKey])

  const showDetail = activeStation !== 'engine' && !!game

  function chooseGame(next: SelectedGame) {
    setGame(next)
    setSelectedIds(createInitialSelection(model, next))
    setActiveStation('base')
    setFocusedKey(null)
  }

  function selectEngine() {
    setActiveStation('engine')
    setFocusedKey(null)
  }

  function selectStation(id: StationId) {
    setActiveStation(id)
    setFocusedKey(null)
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

      <div className="filters-strip" aria-label="Filters">
        <span className="filters-label">Filters</span>
        <input
          type="search"
          className="filters-search"
          placeholder="Search…"
          disabled
          aria-disabled="true"
        />
        <button type="button" className="filter-chip" disabled>
          Level
        </button>
        <button type="button" className="filter-chip" disabled>
          Stability
        </button>
      </div>

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
                  onFocus={setFocusedKey}
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
              <ComponentDetail display={focusedDisplay} model={model} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
