import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import { LevelSelectStrip } from './LevelSelectStrip'
import { ScreenNavButtons } from './ScreenNavButtons'

const GAMES: SelectedGame[] = ['bg1', 'bg2', 'eet', 'iwd', 'pst']

interface Props {
  game: SelectedGame | null
  onChoose: (game: SelectedGame) => void
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  canCycle: boolean
  canOk: boolean
  onPrevious: () => void
  onNext: () => void
  onOk: () => void
}

export function EngineStation({
  game,
  onChoose,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
  canCycle,
  canOk,
  onPrevious,
  onNext,
  onOk,
}: Props) {
  return (
    <section className="engine-station">
      <h2>Choose your engine</h2>
      <p className="lede">
        Pick the base game you are modding. Stations ahead only show components allowed for that
        engine.
      </p>
      <div className="engine-grid">
        {GAMES.map((g) => (
          <button
            key={g}
            type="button"
            className={game === g ? 'engine-card active' : 'engine-card'}
            onClick={() => onChoose(g)}
          >
            {GAME_LABELS[g]}
          </button>
        ))}
      </div>

      <div className="engine-preselect">
        <LevelSelectStrip
          enabled={!!game}
          checkedLadderLevels={checkedLadderLevels}
          lowerDifficulty={lowerDifficulty}
          higherDifficulty={higherDifficulty}
          onLadderToggle={onLadderToggle}
          onDifficultyChange={onDifficultyChange}
        />
        <ScreenNavButtons
          canCycle={canCycle}
          canOk={canOk}
          onPrevious={onPrevious}
          onNext={onNext}
          onOk={onOk}
        />
      </div>
    </section>
  )
}
