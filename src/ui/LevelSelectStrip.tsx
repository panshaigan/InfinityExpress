import {
  DIFFICULTY_LEVELS,
  DIFFICULTY_LEVEL_INFO,
  FILTER_LADDER_LEVELS,
  LADDER_LEVEL_INFO,
  LEVEL_LABELS,
  type DifficultyLevel,
  type LadderLevel,
  type LevelInfo,
} from '../lib/levels'
import { IconTip } from './IconTip'

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

/** Engine page rows: Fixes/Restorations, then Vanilla+/Well blended/Extended. */
const LADDER_ROWS: LadderLevel[][] = [
  ['fixes', 'restoration'],
  ['vanillaPlus', 'blendWell', 'extended'],
]

function LevelCard({
  label,
  info,
  checked,
  enabled,
  compact,
  onChange,
}: {
  label: string
  info?: LevelInfo
  checked: boolean
  enabled: boolean
  compact: boolean
  onChange: (wantChecked: boolean) => void
}) {
  const showTip = !compact && !!info

  return (
    <label
      className={`level-card${!enabled ? ' disabled' : ''}${checked ? ' active' : ''}${
        showTip ? ' has-tip' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!enabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="level-card-copy">
        <span className="level-card-label">{label}</span>
        {!compact && info ? (
          <span className="level-card-hint">{info.summary}</span>
        ) : null}
      </span>
      {showTip && info ? (
        <IconTip variant="level-card" hostSelector=".has-tip">
          <span className="level-card-tip-section">
            <span className="level-card-tip-heading">Type & Depth of Changes</span>
            <span className="level-card-tip-body">{info.typeAndDepth}</span>
          </span>
          <span className="level-card-tip-section">
            <span className="level-card-tip-heading">Who It&apos;s Recommended For</span>
            <span className="level-card-tip-body">{info.recommendedFor}</span>
          </span>
        </IconTip>
      ) : null}
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
        aria-label="Presets for this stop"
      >
        <div className="level-preselect-grid" role="group" aria-label="Levels">
          {FILTER_LADDER_LEVELS.map((level) => (
            <LevelCard
              key={level}
              label={LEVEL_LABELS[level]}
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
      aria-label="Choose your initial selection"
    >
      <div className="level-preselect-layout" role="group" aria-label="Ladder levels">
        {LADDER_ROWS.map((row) => (
          <div
            key={row.join('-')}
            className={`level-row${row.length === 3 ? ' level-row-triple' : ''}`}
          >
            {row.map((level) => (
              <LevelCard
                key={level}
                label={LEVEL_LABELS[level]}
                info={LADDER_LEVEL_INFO[level]}
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
            info={DIFFICULTY_LEVEL_INFO[token]}
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
