import type { DifficultyLevel, LadderLevel } from '../lib/levels'
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
        <button
          type="button"
          className="btn engine-start-btn has-icon-tip"
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue
          <span className="icon-tip icon-tip-below" role="tooltip">
            Continue to the first unfinished stop
          </span>
        </button>
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
