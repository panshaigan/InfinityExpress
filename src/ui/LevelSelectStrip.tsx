import {
  DIFFICULTY_LEVELS,
  FILTER_LADDER_LEVELS,
  LEVEL_HINTS,
  LEVEL_LABELS,
  type DifficultyLevel,
  type LadderLevel,
} from '../lib/levels'

interface Props {
  enabled: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  /** Dense chips without title/lede — for station title panel. */
  compact?: boolean
}

export function LevelSelectStrip({
  enabled,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
  compact = false,
}: Props) {
  const difficultyChecked: Record<DifficultyLevel, boolean> = {
    lowerDifficulty,
    higherDifficulty,
  }

  return (
    <div
      className={`level-preselect${compact ? ' compact' : ''}${!enabled ? ' disabled' : ''}`}
      aria-label={compact ? 'Preselect levels for this stop' : 'Choose preselected components'}
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
          const hint = LEVEL_HINTS[level]
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
              <span className="level-card-copy">
                <span className="level-card-label">{LEVEL_LABELS[level]}</span>
                {!compact && hint ? (
                  <span className="level-card-hint">{hint}</span>
                ) : null}
              </span>
            </label>
          )
        })}
        {DIFFICULTY_LEVELS.map((token) => {
          const checked = difficultyChecked[token]
          const hint = LEVEL_HINTS[token]
          return (
            <label
              key={token}
              className={`level-card${!enabled ? ' disabled' : ''}${checked ? ' active' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!enabled}
                onChange={(e) => onDifficultyChange(token, e.target.checked)}
              />
              <span className="level-card-copy">
                <span className="level-card-label">{LEVEL_LABELS[token]}</span>
                {!compact && hint ? (
                  <span className="level-card-hint">{hint}</span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
