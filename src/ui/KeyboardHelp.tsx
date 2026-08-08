import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const ROWS: { keys: string; action: string }[] = [
  { keys: 'Tab', action: 'When nothing focused: first item on this display' },
  { keys: '?', action: 'Open this keys guide' },
  { keys: '\\', action: 'Collapse / expand the station rail' },
  { keys: ';', action: 'Collapse / expand the details pane' },
  { keys: '[ ]', action: 'Previous / next station (rail order)' },
  { keys: '/', action: 'Jump to search in this window' },
  { keys: 'Esc', action: 'Close filter panel or leave search' },
  { keys: '↑ ↓', action: 'Move in the component list' },
  { keys: 'PgUp PgDn', action: 'Previous / next node one level higher' },
  { keys: 'Space', action: 'Check / uncheck focused row' },
  { keys: 'Enter', action: 'Show details (does not toggle)' },
  { keys: '← →', action: 'Fold / unfold folders' },
  { keys: ', .', action: 'Content: previous / next main branch' },
  { keys: '< >', action: 'Content: previous / next subbranch' },
]

export function KeyboardHelp({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

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
        <p className="keyboard-help-lede">
          Walk with <strong>Done</strong> for a guided path, or jump from the left rail anytime.
          Click a row to check it and focus details; hover previews details without changing focus.
        </p>
        <table className="keyboard-help-table">
          <tbody>
            {ROWS.map((row) => (
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
