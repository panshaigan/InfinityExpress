import { useState } from 'react'
import { pickDirectory } from '../lib/desktop/fsDialogs'
import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import {
  readGameFolderPaths,
  writeGameFolderPaths,
  type GameFolderKey,
} from '../lib/ui/gameFolderPrefs'
import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import { LevelSelectStrip } from './LevelSelectStrip'

const GAME_BLURBS: Record<SelectedGame, string> = {
  bg1: "Baldur's Gate with Siege of Dragonspear (SoD)",
  bg2: 'Shadows of Amn (SoA) and Throne of Bhaal (ToB)',
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

const FOLDERS_BY_GAME: Record<SelectedGame, GameFolderKey[]> = {
  bg1: ['bg1'],
  bg2: ['bg2'],
  eet: ['bg1', 'bg2'],
  iwd: ['iwd'],
  pst: ['pst'],
}

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
  const [folderPaths, setFolderPaths] = useState(readGameFolderPaths)
  const visibleFolders = game ? FOLDERS_BY_GAME[game] : []

  function setFolderPath(key: GameFolderKey, value: string) {
    setFolderPaths((prev) => {
      const next = { ...prev, [key]: value }
      writeGameFolderPaths(next)
      return next
    })
  }

  async function browseFolder(key: GameFolderKey) {
    const path = await pickDirectory(`Select ${GAME_LABELS[key]} folder`)
    if (path) setFolderPath(key, path)
  }

  return (
    <section className="engine-station">
      <div className="engine-station-header">
        <h2>Choose your engine</h2>
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

      {visibleFolders.length > 0 ? (
        <div className="engine-folders">
          <h3 className="engine-folders-title">Unmodded game path</h3>
          <div
            className={`engine-row${visibleFolders.length === 1 ? ' engine-row-span' : ''}`}
          >
            {visibleFolders.map((key) => (
              <div key={key} className="engine-folder-field">
                <label className="engine-folder-label" htmlFor={`game-folder-${key}`}>
                  {GAME_LABELS[key]}
                </label>
                <div className="engine-folder-controls">
                  <input
                    id={`game-folder-${key}`}
                    type="text"
                    className="engine-folder-input"
                    value={folderPaths[key]}
                    onChange={(e) => setFolderPath(key, e.target.value)}
                    placeholder="Select game folder…"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => void browseFolder(key)}
                    title="Choose game folder"
                  >
                    Browse
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="engine-preselect">
        <LevelSelectStrip
          enabled={!!game}
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
