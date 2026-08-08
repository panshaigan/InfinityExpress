import {
  FILTER_LADDER_LEVELS,
  LEVEL_LABELS,
  type LadderLevel,
} from '../../lib/levels'
import type { FilterCriteria } from '../../lib/selection/filterDisplayTree'

interface Props {
  baseId: string
  criteria: FilterCriteria
  onSelectLadder: (level: LadderLevel | null) => void
  onPatch: (partial: Partial<FilterCriteria>) => void
}

export function LevelFilterPanel({
  baseId,
  criteria,
  onSelectLadder,
  onPatch,
}: Props) {
  return (
    <div className="filter-panel-stack">
      <div className="filter-panel-section" role="group" aria-label="Level">
        <label className="filter-option">
          <input
            type="radio"
            name={`${baseId}-ladder`}
            checked={criteria.maxLevel === null}
            onChange={() => onSelectLadder(null)}
          />
          All levels
        </label>
        {FILTER_LADDER_LEVELS.map((level) => (
          <label key={level} className="filter-option">
            <input
              type="radio"
              name={`${baseId}-ladder`}
              checked={criteria.maxLevel === level}
              onChange={() => onSelectLadder(level)}
            />
            {LEVEL_LABELS[level]}
          </label>
        ))}
      </div>
      <div className="filter-panel-section" role="group" aria-label="Level options">
        <label className={`filter-option${criteria.maxLevel ? '' : ' disabled'}`}>
          <input
            type="checkbox"
            checked={criteria.levelExact}
            disabled={!criteria.maxLevel}
            onChange={(e) => onPatch({ levelExact: e.target.checked })}
          />
          This level only
        </label>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={criteria.includeLowerDifficulty}
            onChange={(e) => onPatch({ includeLowerDifficulty: e.target.checked })}
          />
          Include {LEVEL_LABELS.lowerDifficulty}
        </label>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={criteria.includeHigherDifficulty}
            onChange={(e) =>
              onPatch({ includeHigherDifficulty: e.target.checked })
            }
          />
          Include {LEVEL_LABELS.higherDifficulty}
        </label>
      </div>
    </div>
  )
}
