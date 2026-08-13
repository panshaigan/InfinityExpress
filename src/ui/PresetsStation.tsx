import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import type { LevelContentCounts } from '../lib/selection/levelCounts'
import { IconTip } from './IconTip'
import { LevelSelectStrip } from './LevelSelectStrip'

interface Props {
  enabled: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  levelCounts?: Readonly<Record<string, LevelContentCounts>>
  finished: boolean
  canContinue: boolean
  onContinue: () => void
  onReopen: () => void
}

export function PresetsStation({
  enabled,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
  levelCounts,
  finished,
  canContinue,
  onContinue,
  onReopen,
}: Props) {
  return (
    <section className="engine-station presets-station">
      <div className="engine-station-header">
        <h2 className="presets-station-heading">
          <span>Start with a preset</span>
          {finished ? (
            <span className="station-finished-mark" aria-label="Finished">
              ✓
            </span>
          ) : null}
        </h2>
        {finished ? (
          <span className="has-icon-tip">
            <button type="button" className="btn engine-start-btn" onClick={onReopen}>
              Reopen
            </button>
            <IconTip>Mark this stop unfinished again</IconTip>
          </span>
        ) : (
          <span className="has-icon-tip">
            <button
              type="button"
              className="btn engine-start-btn"
              disabled={!canContinue}
              onClick={onContinue}
            >
              Continue
            </button>
            <IconTip>Start selecting components</IconTip>
          </span>
        )}
      </div>
      <div className="engine-preselect">
        <LevelSelectStrip
          enabled={enabled}
          checkedLadderLevels={checkedLadderLevels}
          lowerDifficulty={lowerDifficulty}
          higherDifficulty={higherDifficulty}
          onLadderToggle={onLadderToggle}
          onDifficultyChange={onDifficultyChange}
          levelCounts={levelCounts}
        />
      </div>
    </section>
  )
}
