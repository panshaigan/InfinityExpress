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
  /** Dense chips without title/lede — for station title panel. */
  compact?: boolean
}

export function LevelSelectStrip({
  enabled,
  checkedLadderLevels,
  difficulty,
  onLadderToggle,
  onDifficultyChange,
  compact = false,
}: Props) {
  return (
    <div
      className={`level-preselect${compact ? ' compact' : ''}${!enabled ? ' disabled' : ''}`}
      aria-label={compact ? 'Station install levels' : 'Choose preselected components'}
    >
      {!compact && (
        <>
          <h3 className="level-preselect-title">Choose preselected components</h3>
          <p className="level-preselect-lede">
            Tick the install levels you want filled in automatically. Checking a level also checks
            the ones below it; you can uncheck any of them afterward.
          </p>
        </>
      )}
      <div className="level-preselect-grid" role="group" aria-label="Ladder levels">
        {FILTER_LADDER_LEVELS.map((level) => {
          const checked = checkedLadderLevels.has(level)
          return (
            <label
              key={level}
              className={`level-card${!enabled ? ' disabled' : ''}${checked ? ' active' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!enabled}
                onChange={(e) => onLadderToggle(level, e.target.checked)}
              />
              <span className="level-card-label">{LEVEL_LABELS[level]}</span>
            </label>
          )
        })}
        <label
          className={`level-card${!enabled ? ' disabled' : ''}${difficulty ? ' active' : ''}`}
        >
          <input
            type="checkbox"
            checked={difficulty}
            disabled={!enabled}
            onChange={(e) => onDifficultyChange(e.target.checked)}
          />
          <span className="level-card-label">{LEVEL_LABELS.difficulty}</span>
        </label>
      </div>
    </div>
  )
}
