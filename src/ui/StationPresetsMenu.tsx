import { useEffect, useId, useRef, useState } from 'react'
import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import { LevelSelectStrip } from './LevelSelectStrip'

interface Props {
  enabled?: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  onClearToGlobal: () => void
}

/** Compact Presets dropdown for the station header nav row. */
export function StationPresetsMenu({
  enabled = true,
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
  onClearToGlobal,
}: Props) {
  const levelsMenuRef = useRef<HTMLDivElement>(null)
  const levelsPanelId = useId()
  const [levelsOpen, setLevelsOpen] = useState(false)
  const levelOverrideCount =
    checkedLadderLevels.size +
    (lowerDifficulty ? 1 : 0) +
    (higherDifficulty ? 1 : 0)

  useEffect(() => {
    if (!levelsOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!levelsMenuRef.current?.contains(e.target as Node)) setLevelsOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setLevelsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [levelsOpen])

  return (
    <div ref={levelsMenuRef} className="station-levels-menu">
      <button
        type="button"
        className={`btn secondary station-levels-trigger${levelsOpen ? ' open' : ''}`}
        aria-expanded={levelsOpen}
        aria-controls={levelsPanelId}
        onClick={() => setLevelsOpen((v) => !v)}
      >
        <span className="station-levels-trigger-label">
          Presets
          {levelOverrideCount > 0 ? ` (${levelOverrideCount})` : ''}
        </span>
        <span className="station-levels-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {levelsOpen && (
        <div className="station-levels-popover" id={levelsPanelId} role="group">
          <div className="station-list-toolbar-levels">
            <LevelSelectStrip
              compact
              enabled={enabled}
              checkedLadderLevels={checkedLadderLevels}
              lowerDifficulty={lowerDifficulty}
              higherDifficulty={higherDifficulty}
              onLadderToggle={onLadderToggle}
              onDifficultyChange={onDifficultyChange}
            />
            <button
              type="button"
              className="btn secondary station-clear-to-global has-icon-tip"
              disabled={!enabled}
              onClick={onClearToGlobal}
            >
              Reset to global
              <span className="icon-tip" role="tooltip">
                Clear this stop’s level picks back to the last Engine preset
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
