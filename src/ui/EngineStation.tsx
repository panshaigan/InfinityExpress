import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'

const GAMES: SelectedGame[] = ['bg1', 'bg2', 'eet', 'iwd', 'pst']

interface Props {
  game: SelectedGame | null
  onChoose: (game: SelectedGame) => void
}

export function EngineStation({ game, onChoose }: Props) {
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
    </section>
  )
}
