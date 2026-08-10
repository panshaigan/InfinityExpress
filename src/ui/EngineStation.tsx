import { useEffect, useState } from 'react'
import { probeGameFolder } from '../lib/desktop/gameExe'
import {
  readGameFolderPaths,
  readGameFolderVersions,
  writeGameFolderPaths,
  writeGameFolderVersions,
  type GameFolderKey,
} from '../lib/ui/gameFolderPrefs'
import { PATHS_CHANGED_EVENT } from '../lib/ui/pathPrefsEvents'
import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import { DirectoryField } from './DirectoryField'
import { IconTip } from './IconTip'

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
  canContinue: boolean
  onContinue: () => void
}

export function EngineStation({
  game,
  onChoose,
  canContinue,
  onContinue,
}: Props) {
  const [folderPaths, setFolderPaths] = useState(readGameFolderPaths)
  const [folderVersions, setFolderVersions] = useState(readGameFolderVersions)
  const [folderErrors, setFolderErrors] = useState<Partial<Record<GameFolderKey, string>>>(
    {},
  )
  const visibleFolders = game ? FOLDERS_BY_GAME[game] : []

  useEffect(() => {
    function sync() {
      setFolderPaths(readGameFolderPaths())
      setFolderVersions(readGameFolderVersions())
    }
    window.addEventListener(PATHS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(PATHS_CHANGED_EVENT, sync)
  }, [])

  // Backfill FileVersion for paths that were saved before version probing existed.
  useEffect(() => {
    let cancelled = false
    const paths = readGameFolderPaths()
    const versions = readGameFolderVersions()
    void (async () => {
      let next = { ...versions }
      let changed = false
      for (const key of Object.keys(paths) as GameFolderKey[]) {
        if (!paths[key]?.trim() || next[key]?.trim()) continue
        const result = await probeGameFolder(key, paths[key])
        if (cancelled) return
        if (result.ok && result.version) {
          next = { ...next, [key]: result.version }
          changed = true
        }
      }
      if (!cancelled && changed) {
        writeGameFolderVersions(next)
        setFolderVersions(next)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function setFolderPath(key: GameFolderKey, value: string) {
    setFolderPaths((prev) => ({ ...prev, [key]: value }))
    if (!value.trim()) {
      setFolderPaths((prev) => {
        const next = { ...prev, [key]: '' }
        writeGameFolderPaths(next)
        return next
      })
      setFolderVersions((prev) => {
        const next = { ...prev, [key]: '' }
        writeGameFolderVersions(next)
        return next
      })
      setFolderErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  function validateFolderPath(key: GameFolderKey, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setFolderPath(key, '')
      return
    }

    void probeGameFolder(key, trimmed).then((result) => {
      if (!result.ok) {
        setFolderErrors((prev) => ({
          ...prev,
          [key]: result.error,
        }))
        setFolderPaths((prev) => ({
          ...prev,
          [key]: readGameFolderPaths()[key],
        }))
        return
      }
      setFolderPaths((prev) => {
        const next = { ...prev, [key]: trimmed }
        writeGameFolderPaths(next)
        return next
      })
      setFolderVersions((prev) => {
        const next = { ...prev, [key]: result.version }
        writeGameFolderVersions(next)
        return next
      })
      setFolderErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    })
  }

  return (
    <section className="engine-station">
      <div className="engine-station-header">
        <h2>Choose your engine</h2>
        <span className="has-icon-tip">
          <button
            type="button"
            className="btn engine-start-btn"
            disabled={!canContinue}
            onClick={onContinue}
          >
            Continue
          </button>
          <IconTip>Continue to Presets</IconTip>
        </span>
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
              <DirectoryField
                key={key}
                id={`game-folder-${key}`}
                label={GAME_LABELS[key]}
                value={folderPaths[key]}
                onChange={(value) => setFolderPath(key, value)}
                onValidate={(value) => validateFolderPath(key, value)}
                placeholder="Select game folder…"
                browseTitle={`Select ${GAME_LABELS[key]} folder`}
                hint={folderVersions[key] ? `v${folderVersions[key]}` : null}
                error={folderErrors[key] ?? null}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
