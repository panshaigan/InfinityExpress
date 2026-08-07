import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import { LevelSelectStrip } from './LevelSelectStrip'
import { ScreenNavButtons } from './ScreenNavButtons'

const GAMES: SelectedGame[] = ['bg1', 'bg2', 'eet', 'iwd', 'pst']

const GAME_BLURBS: Record<SelectedGame, string> = {
  bg1: "Baldur's Gate",
  bg2: 'Shadows of Amn',
  eet: 'The full saga',
  iwd: 'Icewind Dale',
  pst: 'Torment',
}

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
  finished: boolean
  onPrevious: () => void
  onNext: () => void
  onOk: () => void
  onCancel: () => void
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
  finished,
  onPrevious,
  onNext,
  onOk,
  onCancel,
}: Props) {
  return (
    <section className="engine-station">
      <p className="engine-brand-mark">Infinity Express</p>
      <h2>Choose your engine</h2>
      <p className="lede">
        Pick the game you are modding. Press <strong>Done</strong> to walk stop by stop, or jump
        freely from the left rail anytime.
      </p>
      <div className="engine-grid">
        {GAMES.map((g) => (
          <button
            key={g}
            type="button"
            className={game === g ? 'engine-card active' : 'engine-card'}
            onClick={() => onChoose(g)}
          >
            <span className="engine-card-title">{GAME_LABELS[g]}</span>
            <span className="engine-card-blurb">{GAME_BLURBS[g]}</span>
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
          finished={finished}
          onPrevious={onPrevious}
          onNext={onNext}
          onOk={onOk}
          onCancel={onCancel}
        />
      </div>
    </section>
  )
}
