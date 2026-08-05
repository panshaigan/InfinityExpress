import { useEffect, useRef, type ChangeEvent } from 'react'
import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import type { DisplayNode } from '../lib/selection/visibility'
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
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const checked = listState === 'checked'
  const empty = listNodes.length === 0

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
        <button
          type="button"
          className="filter-inline-action station-clear-to-global"
          onClick={onClearToGlobal}
          title="Clear selections in this station beyond the last Engine level preset"
        >
          Reset to global
        </button>
      </div>
    </div>
  )
}
