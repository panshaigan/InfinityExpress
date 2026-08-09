import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import { IconTip } from './IconTip'
import { LevelSelectStrip } from './LevelSelectStrip'

interface Props {
  enabled: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
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
  canContinue,
  onContinue,
}: Props) {
  return (
    <section className="engine-station presets-station">
      <div className="engine-station-header">
        <h2>Choose your initial selection</h2>
        <span className="has-icon-tip">
          <button
            type="button"
            className="btn engine-start-btn"
            disabled={!canContinue}
            onClick={onContinue}
          >
            Continue
          </button>
          <IconTip>Continue to the first unfinished stop</IconTip>
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
        />
      </div>
    </section>
  )
}
