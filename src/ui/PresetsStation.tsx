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
  canContinue: boolean
  onContinue: () => void
}

export function PresetsStation({
  enabled,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
  levelCounts,
  canContinue,
  onContinue,
}: Props) {
  return (
    <section className="engine-station presets-station">
      <div className="engine-station-header">
        <h2 className="presets-station-heading">
          <span>Start with a preset</span>
        </h2>
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
