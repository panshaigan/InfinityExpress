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

function LevelCard({
  label,
  hint,
  checked,
  enabled,
  compact,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  enabled: boolean
  compact: boolean
  onChange: (wantChecked: boolean) => void
}) {
  return (
    <label
      className={`level-card${!enabled ? ' disabled' : ''}${checked ? ' active' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!enabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="level-card-copy">
        <span className="level-card-label">{label}</span>
        {!compact && hint ? (
          <span className="level-card-hint">{hint}</span>
        ) : null}
      </span>
    </label>
  )
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

  const ladderCards = FILTER_LADDER_LEVELS.map((level) => (
    <LevelCard
      key={level}
      label={LEVEL_LABELS[level]}
      hint={LEVEL_HINTS[level]}
      checked={checkedLadderLevels.has(level)}
      enabled={enabled}
      compact={compact}
      onChange={(want) => onLadderToggle(level, want)}
    />
  ))

  const difficultyCards = DIFFICULTY_LEVELS.map((token) => (
    <LevelCard
      key={token}
      label={LEVEL_LABELS[token]}
      hint={LEVEL_HINTS[token]}
      checked={difficultyChecked[token]}
      enabled={enabled}
      compact={compact}
      onChange={(want) => onDifficultyChange(token, want)}
    />
  ))

  return (
    <div
      className={`level-preselect${compact ? ' compact' : ''}${!enabled ? ' disabled' : ''}`}
      aria-label={
        compact ? 'Preselect levels for this stop' : 'Choose your base components'
      }
    >
      {!compact && (
        <h3 className="level-preselect-title">Choose your base components</h3>
      )}
      {compact ? (
        <div className="level-preselect-grid" role="group" aria-label="Levels">
          {ladderCards}
          {difficultyCards}
        </div>
      ) : (
        <>
          <div className="level-preselect-grid" role="group" aria-label="Ladder levels">
            {ladderCards}
          </div>
          <div
            className="level-preselect-grid level-difficulty-grid"
            role="group"
            aria-label="Difficulty"
          >
            {difficultyCards}
          </div>
        </>
      )}
    </div>
  )
}
