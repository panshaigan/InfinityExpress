import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import { LevelSelectStrip } from './LevelSelectStrip'

const GAME_BLURBS: Record<SelectedGame, string> = {
  bg1: "Baldur's Gate, Siege of Dragonspear (SoD)",
  bg2: 'Shadows of Amn (SoA), Throne of Bhaal (ToB)',
  eet: 'The full saga merged into one game',
  iwd: 'Icewind Dale',
  pst: 'Planescape: Torment',
}

/** Layout rows: BG pair, full-width EET, then IWD/PST. */
const ENGINE_ROWS: SelectedGame[][] = [
  ['bg1', 'bg2'],
  ['eet'],
  ['iwd', 'pst'],
]

interface Props {
  game: SelectedGame | null
  onChoose: (game: SelectedGame) => void
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  canStart: boolean
  onStart: () => void
}

export function EngineStation({
  game,
  onChoose,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
  canStart,
  onStart,
}: Props) {
  return (
    <section className="engine-station">
      <h2>Choose your engine</h2>
      <div className="engine-grid">
        {ENGINE_ROWS.map((row) => (
          <div
            key={row.join('-')}
            className={`engine-row${row.length === 1 ? ' engine-row-span' : ''}`}
          >
            {row.map((g) => (
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
        <div className="engine-start-row">
          <button
            type="button"
            className="btn engine-start-btn"
            disabled={!canStart}
            onClick={onStart}
            title="Continue to the first unfinished stop"
          >
            Start
          </button>
        </div>
      </div>
    </section>
  )
}
