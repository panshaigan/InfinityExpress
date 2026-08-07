import { useEffect, useRef, type ChangeEvent } from 'react'
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
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const checked = listState === 'checked'
  const empty = listNodes.length === 0
  const foldDisabled = empty || collectAllExpandableKeys(listNodes).length === 0
  const levelOverrideCount =
    checkedLadderLevels.size +
    (lowerDifficulty ? 1 : 0) +
    (higherDifficulty ? 1 : 0)

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = listState === 'indeterminate'
    }
  }, [listState])

  function handleSelectAllChange(e: ChangeEvent<HTMLInputElement>) {
    onToggleAll(e.target.checked)
  }

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
        <span className="station-fold-all">
          <button
            type="button"
            className="filter-inline-action"
            disabled={foldDisabled}
            aria-label="Unfold all on this list"
            onClick={onUnfoldAll}
          >
            Unfold all
          </button>
          <button
            type="button"
            className="filter-inline-action"
            disabled={foldDisabled}
            aria-label="Fold all on this list"
            onClick={onFoldAll}
          >
            Fold all
          </button>
        </span>
      </div>
      <details className="station-levels-fold">
        <summary>
          Preselect levels
          {levelOverrideCount > 0 ? ` (${levelOverrideCount})` : ''}
        </summary>
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
      </details>
    </div>
  )
}
