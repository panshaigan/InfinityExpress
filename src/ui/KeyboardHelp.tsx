import { useEffect, useRef } from 'react'
import type { AppPhase } from './PhaseNav'

interface Props {
  open: boolean
  phase: AppPhase
  onClose: () => void
}

type HelpRow = { keys: string; action: string }

const SHARED: HelpRow[] = [
  { keys: 'Tab', action: 'When nothing focused: first item on this display' },
  { keys: '?', action: 'Open this keys guide' },
  { keys: ';', action: 'Collapse / expand the details pane' },
  { keys: '/', action: 'Jump to search in this window' },
  { keys: 'Esc', action: 'Close dialogs or leave search' },
]

const COMPONENTS_ROWS: HelpRow[] = [
  { keys: '\\', action: 'Collapse / expand the station rail' },
  { keys: '[ ]', action: 'Previous / next station (rail order)' },
  { keys: '↑ ↓', action: 'Move in the component list' },
  { keys: 'PgUp PgDn', action: 'Previous / next node one level higher' },
  { keys: 'Space', action: 'Check / uncheck focused row' },
  { keys: 'Enter', action: 'Show details (does not toggle)' },
  { keys: '← →', action: 'Fold / unfold folders' },
  { keys: ', .', action: 'Content: previous / next main branch' },
  { keys: '< >', action: 'Content: previous / next subbranch' },
]

const MODS_ROWS: HelpRow[] = [
  { keys: '↑ ↓', action: 'Move in the mods table' },
  { keys: 'Home End', action: 'First / last visible mod' },
  { keys: 'Space', action: 'Select / deselect focused mod' },
  { keys: 'Enter', action: 'Show details (does not toggle)' },
]

const INSTALL_ROWS: HelpRow[] = []

function rowsForPhase(phase: AppPhase): HelpRow[] {
  if (phase === 'mods') return [...SHARED, ...MODS_ROWS]
  if (phase === 'install') return [...SHARED, ...INSTALL_ROWS]
  return [...SHARED, ...COMPONENTS_ROWS]
}

function ledeForPhase(phase: AppPhase) {
  if (phase === 'mods') {
    return (
      <>
        Browse and select mods for download. Use arrow keys in the table; Space
        marks a row for bulk actions.
      </>
    )
  }
  if (phase === 'install') {
    return (
      <>
        Install order and run controls live here once the desktop installer is
        wired up.
      </>
    )
  }
  return (
    <>
      Walk with <strong>Done</strong> for a guided path, or jump from the left
      rail anytime. Click a row to check it and focus details; hover previews
      details without changing focus.
    </>
  )
}

export function KeyboardHelp({ open, phase, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const rows = rowsForPhase(phase)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="keyboard-help-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="keyboard-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="keyboard-help-title">Keys &amp; rhythm</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn secondary keyboard-help-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="keyboard-help-lede">{ledeForPhase(phase)}</p>
        <table className="keyboard-help-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.keys}>
                <th scope="row">
                  <kbd>{row.keys}</kbd>
                </th>
                <td>{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
