import { useEffect, useRef } from 'react'
import { useBackdropDismiss } from './backdropDismiss'
import type { AppPhase } from './PhaseNav'

interface Props {
  open: boolean
  phase: AppPhase
  onClose: () => void
}

type HelpRow = { keys: string; action: string }

const SHARED: HelpRow[] = [
  { keys: 'Tab', action: 'When nothing focused: first item on this display' },
  { keys: 'F1', action: 'Open this keys guide' },
  { keys: 'F3', action: 'Jump to search in this window (desktop)' },
  { keys: 'Ctrl+F', action: 'Jump to search in this window (desktop)' },
  { keys: 'F6', action: 'Focus the list / table on this display (desktop)' },
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

const INSTALL_ROWS: HelpRow[] = [
  { keys: '↑ ↓', action: 'Move in the install steps table' },
  { keys: 'Home End', action: 'First / last visible step row' },
]

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
        Browse the install plan and follow run progress. Use arrow keys in the
        table; Home and End jump to the first or last visible row.
      </>
    )
  }
  return (
    <>
      Walk with <strong>Done</strong> for a guided path, or jump from the left
      rail anytime. Click a row to focus details; double-click to check it. Hover
      previews details without changing focus.
    </>
  )
}

export function KeyboardHelp({ open, phase, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)
  const rows = rowsForPhase(phase)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
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
      {...backdrop}
    >
      <div
        ref={panelRef}
        className="keyboard-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-help-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="keyboard-help-title">Keys &amp; rhythm</h2>
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
