import { useId } from 'react'
import {
  FILTER_LADDER_LEVELS,
  LEVEL_LABELS,
  type LadderLevel,
} from '../lib/levels'

interface Props {
  enabled: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  difficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (want: boolean) => void
}

export function LevelSelectStrip({
  enabled,
  checkedLadderLevels,
  difficulty,
  onLadderToggle,
  onDifficultyChange,
}: Props) {
  const baseId = useId()

  return (
    <div
      className={`level-select-strip${!enabled ? ' disabled' : ''}`}
      aria-label="Level selection"
    >
      <div className="filters-row">
        <span className="filters-label">Choose preselected components</span>
        <div className="filter-panel" role="group" aria-label="Ladder level">
          {FILTER_LADDER_LEVELS.map((level) => (
            <label
              key={level}
              className={`filter-option${!enabled ? ' disabled' : ''}`}
              data-checked={checkedLadderLevels.has(level)}
            >
              <input
                type="checkbox"
                checked={checkedLadderLevels.has(level)}
                disabled={!enabled}
                onChange={(e) => onLadderToggle(level, e.target.checked)}
              />
              {LEVEL_LABELS[level]}
            </label>
          ))}
          <label className={`filter-option${!enabled ? ' disabled' : ''}`}>
            <input
              type="checkbox"
              checked={difficulty}
              disabled={!enabled}
              onChange={(e) => onDifficultyChange(e.target.checked)}
            />
            {LEVEL_LABELS.difficulty}
          </label>
        </div>
      </div>
    </div>
  )
}
