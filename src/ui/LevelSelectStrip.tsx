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
import type { PresetTileRef } from '../lib/selection/presetPreview'
import type { LevelContentCounts } from '../lib/selection/levelCounts'
import { IconTip } from './IconTip'

interface Props {
  enabled: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  /** Exact (non-cumulative) mod/component counts per level — full cards only. */
  levelCounts?: Readonly<Record<string, LevelContentCounts>>
  /** Dense chips without title/lede — for station title panel. */
  compact?: boolean
  onTileFocus?: (tile: PresetTileRef) => void
  onTileHover?: (tile: PresetTileRef | null) => void
  isTileFocused?: (tile: PresetTileRef) => boolean
}

/** Engine page rows: Fixes/Restorations, then Vanilla+/Well blended/Extended. */
const LADDER_ROWS: LadderLevel[][] = [
  ['fixes', 'restoration'],
  ['vanillaPlus', 'blendWell', 'extended'],
]

function formatLevelCounts(counts: LevelContentCounts | undefined): string | null {
  if (!counts) return null
  const modLabel = counts.mods === 1 ? '1 mod' : `${counts.mods} mods`
  const compLabel =
    counts.components === 1 ? '1 component' : `${counts.components} components`
  return `${modLabel} · ${compLabel}`
}

function LevelCard({
  tileRef,
  label,
  info,
  counts,
  checked,
  enabled,
  compact,
  focused,
  onChange,
  onTileFocus,
  onTileHover,
}: {
  tileRef?: PresetTileRef
  label: string
  info?: LevelInfo
  counts?: LevelContentCounts
  checked: boolean
  enabled: boolean
  compact: boolean
  focused?: boolean
  onChange: (wantChecked: boolean) => void
  onTileFocus?: (tile: PresetTileRef) => void
  onTileHover?: (tile: PresetTileRef | null) => void
}) {
  const showTip = !compact && !!info
  const countsLabel = formatLevelCounts(counts)

  return (
    <label
      className={`level-card${!enabled ? ' disabled' : ''}${checked ? ' active' : ''}${
        focused ? ' tile-focused' : ''
      }${showTip ? ' has-tip' : ''}`}
      onPointerEnter={() => tileRef && onTileHover?.(tileRef)}
      onClick={() => tileRef && onTileFocus?.(tileRef)}
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
          {countsLabel ? (
            <span className="level-card-tip-section">
              <span className="level-card-tip-heading">In this level</span>
              <span className="level-card-tip-body">{countsLabel}</span>
            </span>
          ) : null}
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
  levelCounts,
  compact = false,
  onTileFocus,
  onTileHover,
  isTileFocused,
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
      aria-label="Start with a preset"
      onPointerLeave={() => onTileHover?.(null)}
    >
      <div className="level-preselect-layout" role="group" aria-label="Ladder levels">
        {LADDER_ROWS.map((row) => (
          <div
            key={row.join('-')}
            className={`level-row${row.length === 3 ? ' level-row-triple' : ''}`}
          >
            {row.map((level) => {
              const tileRef: PresetTileRef = { kind: 'ladder', level }
              return (
              <LevelCard
                key={level}
                tileRef={tileRef}
                label={LEVEL_LABELS[level]}
                info={LADDER_LEVEL_INFO[level]}
                counts={levelCounts?.[level]}
                checked={checkedLadderLevels.has(level)}
                enabled={enabled}
                compact={false}
                focused={isTileFocused?.(tileRef)}
                onChange={(want) => onLadderToggle(level, want)}
                onTileFocus={onTileFocus}
                onTileHover={onTileHover}
              />
              )
            })}
          </div>
        ))}
      </div>
      <hr className="level-difficulty-rule" />
      <div
        className="level-row level-difficulty-row"
        role="group"
        aria-label="Difficulty"
      >
        {DIFFICULTY_LEVELS.map((token) => {
          const tileRef: PresetTileRef = { kind: 'difficulty', token }
          return (
          <LevelCard
            key={token}
            tileRef={tileRef}
            label={LEVEL_LABELS[token]}
            info={DIFFICULTY_LEVEL_INFO[token]}
            counts={levelCounts?.[token]}
            checked={difficultyChecked[token]}
            enabled={enabled}
            compact={false}
            focused={isTileFocused?.(tileRef)}
            onChange={(want) => onDifficultyChange(token, want)}
            onTileFocus={onTileFocus}
            onTileHover={onTileHover}
          />
          )
        })}
      </div>
    </div>
  )
}
