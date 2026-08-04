import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import type { LadderLevel } from '../lib/levels'
import { LevelSelectStrip } from './LevelSelectStrip'

const GAMES: SelectedGame[] = ['bg1', 'bg2', 'eet', 'iwd', 'pst']

interface Props {
  game: SelectedGame | null
  onChoose: (game: SelectedGame) => void
  checkedLadderLevels: ReadonlySet<LadderLevel>
  difficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (want: boolean) => void
  onCustomize: () => void
}

export function EngineStation({
  game,
  onChoose,
  checkedLadderLevels,
  difficulty,
  onLadderToggle,
  onDifficultyChange,
  onCustomize,
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
          difficulty={difficulty}
          onLadderToggle={onLadderToggle}
          onDifficultyChange={onDifficultyChange}
        />
        <button
          type="button"
          className="btn customize-btn"
          disabled={!game}
          onClick={onCustomize}
        >
          Customize
        </button>
      </div>
    </section>
  )
}
