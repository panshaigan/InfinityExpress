import { useId } from 'react'
import {
  FILTER_LADDER_LEVELS,
  LEVEL_LABELS,
  type LadderLevel,
} from '../lib/levels'

interface Props {
  enabled: boolean
  ladder: LadderLevel | null
  difficulty: boolean
  onLadderChange: (level: LadderLevel | null) => void
  onDifficultyChange: (want: boolean) => void
}

export function LevelSelectStrip({
  enabled,
  ladder,
  difficulty,
  onLadderChange,
  onDifficultyChange,
}: Props) {
  const baseId = useId()

  return (
    <div
      className={`level-select-strip${!enabled ? ' disabled' : ''}`}
      aria-label="Level selection"
    >
      <div className="filters-row">
        <span className="filters-label">Level selection</span>
        <div className="filter-panel" role="group" aria-label="Ladder level">
          <label className={`filter-option${!enabled ? ' disabled' : ''}`}>
            <input
              type="radio"
              name={`${baseId}-ladder`}
              checked={ladder === null}
              disabled={!enabled}
              onChange={() => onLadderChange(null)}
            />
            None
          </label>
          {FILTER_LADDER_LEVELS.map((level) => (
            <label
              key={level}
              className={`filter-option${!enabled ? ' disabled' : ''}`}
            >
              <input
                type="radio"
                name={`${baseId}-ladder`}
                checked={ladder === level}
                disabled={!enabled}
                onChange={() => onLadderChange(level)}
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
