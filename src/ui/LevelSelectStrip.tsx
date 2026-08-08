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

/** Engine page rows: pair / full-width / pair. */
const LADDER_ROWS: LadderLevel[][] = [
  ['fixes', 'restoration'],
  ['vanillaPlus'],
  ['blendWell', 'extended'],
]

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

  if (compact) {
    return (
      <div
        className={`level-preselect compact${!enabled ? ' disabled' : ''}`}
        aria-label="Preselect levels for this stop"
      >
        <div className="level-preselect-grid" role="group" aria-label="Levels">
          {FILTER_LADDER_LEVELS.map((level) => (
            <LevelCard
              key={level}
              label={LEVEL_LABELS[level]}
              hint={LEVEL_HINTS[level]}
              checked={checkedLadderLevels.has(level)}
              enabled={enabled}
              compact
              onChange={(want) => onLadderToggle(level, want)}
            />
          ))}
          {DIFFICULTY_LEVELS.map((token) => (
            <LevelCard
              key={token}
              label={LEVEL_LABELS[token]}
              hint={LEVEL_HINTS[token]}
              checked={difficultyChecked[token]}
              enabled={enabled}
              compact
              onChange={(want) => onDifficultyChange(token, want)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`level-preselect${!enabled ? ' disabled' : ''}`}
      aria-label="Choose your base components"
    >
      <h3 className="level-preselect-title">Choose your base components</h3>
      <div className="level-preselect-layout" role="group" aria-label="Ladder levels">
        {LADDER_ROWS.map((row) => (
          <div
            key={row.join('-')}
            className={`level-row${row.length === 1 ? ' level-row-span' : ''}`}
          >
            {row.map((level) => (
              <LevelCard
                key={level}
                label={LEVEL_LABELS[level]}
                hint={LEVEL_HINTS[level]}
                checked={checkedLadderLevels.has(level)}
                enabled={enabled}
                compact={false}
                onChange={(want) => onLadderToggle(level, want)}
              />
            ))}
          </div>
        ))}
      </div>
      <hr className="level-difficulty-rule" />
      <div
        className="level-row level-difficulty-row"
        role="group"
        aria-label="Difficulty"
      >
        {DIFFICULTY_LEVELS.map((token) => (
          <LevelCard
            key={token}
            label={LEVEL_LABELS[token]}
            hint={LEVEL_HINTS[token]}
            checked={difficultyChecked[token]}
            enabled={enabled}
            compact={false}
            onChange={(want) => onDifficultyChange(token, want)}
          />
        ))}
      </div>
    </div>
  )
}
