import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import { FILTER_LADDER_LEVELS, DIFFICULTY_LEVELS, LEVEL_LABELS } from '../lib/levels'

interface Props {
  enabled: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
}

function LevelChip({
  label,
  checked,
  enabled,
  onChange,
}: {
  label: string
  checked: boolean
  enabled: boolean
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
      </span>
    </label>
  )
}

/** Compact level chips for per-station preset overrides (station header menu). */
export function LevelSelectStrip({
  enabled,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
}: Props) {
  const difficultyChecked: Record<DifficultyLevel, boolean> = {
    lowerDifficulty,
    higherDifficulty,
  }

  return (
    <div
      className={`level-preselect compact${!enabled ? ' disabled' : ''}`}
      aria-label="Presets for this stop"
    >
      <div className="level-preselect-grid" role="group" aria-label="Levels">
        {FILTER_LADDER_LEVELS.map((level) => (
          <LevelChip
            key={level}
            label={LEVEL_LABELS[level]}
            checked={checkedLadderLevels.has(level)}
            enabled={enabled}
            onChange={(want) => onLadderToggle(level, want)}
          />
        ))}
        {DIFFICULTY_LEVELS.map((token) => (
          <LevelChip
            key={token}
            label={LEVEL_LABELS[token]}
            checked={difficultyChecked[token]}
            enabled={enabled}
            onChange={(want) => onDifficultyChange(token, want)}
          />
        ))}
      </div>
    </div>
  )
}
