import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import type { DisplayNode } from '../lib/selection/visibility'
import { collectAllExpandableKeys } from '../lib/ui/treeKeyboard'
import { LevelSelectStrip } from './LevelSelectStrip'

interface Props {
  listNodes: DisplayNode[]
  listState: 'checked' | 'unchecked' | 'indeterminate'
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onToggleAll: (wantSelected: boolean) => void
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  onClearToGlobal: () => void
  onFoldAll: () => void
  onUnfoldAll: () => void
  children?: ReactNode
}

export function StationListToolbar({
  listNodes,
  listState,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onToggleAll,
  onLadderToggle,
  onDifficultyChange,
  onClearToGlobal,
  onFoldAll,
  onUnfoldAll,
  children,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const levelsMenuRef = useRef<HTMLDivElement>(null)
  const levelsPanelId = useId()
  const [allUnfolded, setAllUnfolded] = useState(false)
  const [levelsOpen, setLevelsOpen] = useState(false)

  const checked = listState === 'checked'
  const empty = listNodes.length === 0
  const expandableKeys = useMemo(() => collectAllExpandableKeys(listNodes), [listNodes])
  const foldDisabled = empty || expandableKeys.length === 0
  const expandableKeySignature = expandableKeys.join('\0')
  const levelOverrideCount =
    checkedLadderLevels.size +
    (lowerDifficulty ? 1 : 0) +
    (higherDifficulty ? 1 : 0)

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = listState === 'indeterminate'
    }
  }, [listState])

  useEffect(() => {
    setAllUnfolded(false)
  }, [expandableKeySignature])

  useEffect(() => {
    if (!levelsOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!levelsMenuRef.current?.contains(e.target as Node)) setLevelsOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setLevelsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [levelsOpen])

  function handleSelectAllChange(e: ChangeEvent<HTMLInputElement>) {
    onToggleAll(e.target.checked)
  }

  function handleFoldToggle() {
    if (allUnfolded) {
      onFoldAll()
      setAllUnfolded(false)
    } else {
      onUnfoldAll()
      setAllUnfolded(true)
    }
  }

  const foldLabel = allUnfolded ? 'Fold all' : 'Unfold all'

  return (
    <div className="station-list-toolbar">
      <div className="station-list-toolbar-primary">
        <label className={`station-select-all${empty ? ' disabled' : ''}`}>
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={checked}
            disabled={empty}
            aria-label="Select all on this list"
            onChange={handleSelectAllChange}
          />
          <span>Select all</span>
        </label>
        <button
          type="button"
          className="station-fold-toggle"
          disabled={foldDisabled}
          aria-label={`${foldLabel} on this list`}
          onClick={handleFoldToggle}
        >
          {foldLabel}
        </button>
        {children}
        <div ref={levelsMenuRef} className="station-levels-menu">
          <button
            type="button"
            className={`btn secondary station-levels-trigger${levelsOpen ? ' open' : ''}`}
            aria-expanded={levelsOpen}
            aria-controls={levelsPanelId}
            onClick={() => setLevelsOpen((v) => !v)}
          >
            <span className="station-levels-trigger-label">
              Preselect levels
              {levelOverrideCount > 0 ? ` (${levelOverrideCount})` : ''}
            </span>
            <span className="station-levels-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {levelsOpen && (
            <div className="station-levels-popover" id={levelsPanelId} role="group">
              <div className="station-list-toolbar-levels">
                <LevelSelectStrip
                  compact
                  enabled
                  checkedLadderLevels={checkedLadderLevels}
                  lowerDifficulty={lowerDifficulty}
                  higherDifficulty={higherDifficulty}
                  onLadderToggle={onLadderToggle}
                  onDifficultyChange={onDifficultyChange}
                />
                <p className="station-levels-hint">
                  Sets which components start checked on this stop. Does not hide rows — use Show
                  levels in filters for that.
                </p>
                <button
                  type="button"
                  className="filter-inline-action station-clear-to-global"
                  onClick={onClearToGlobal}
                  title="Clear this stop’s level picks back to the last Engine preset"
                >
                  Reset to global
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
