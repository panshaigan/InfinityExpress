import { useEffect, useRef, useState } from 'react'
import { useBackdropDismiss } from '../backdropDismiss'

export type RestartScope = 'eet-stage' | 'full'

interface Props {
  open: boolean
  eetMode: boolean
  onConfirm: (scope: RestartScope) => void
  onCancel: () => void
}

export function RestartConfirmDialog({ open, eetMode, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const backdrop = useBackdropDismiss(onCancel)
  const [scope, setScope] = useState<RestartScope>('eet-stage')

  useEffect(() => {
    if (!open) return
    setScope('eet-stage')
    cancelRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="confirm-dialog-backdrop" role="presentation" {...backdrop}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restart-dialog-title"
        aria-describedby="restart-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <h2 id="restart-dialog-title">Restart from vanilla backup?</h2>
        </div>
        <div id="restart-dialog-message" className="confirm-dialog-message">
          <p>
            Restore the vanilla backup and reset the install plan? Your modded game folder
            {eetMode ? ' folder(s)' : ''} will be wiped.
          </p>
          {eetMode ? (
            <fieldset className="backup-include-fieldset">
              <legend>Restart scope</legend>
              <label className="install-filter-toggle">
                <input
                  type="radio"
                  name="restart-scope"
                  checked={scope === 'eet-stage'}
                  onChange={() => setScope('eet-stage')}
                />
                <span>EET stage only (BG2)</span>
              </label>
              <label className="install-filter-toggle">
                <input
                  type="radio"
                  name="restart-scope"
                  checked={scope === 'full'}
                  onChange={() => setScope('full')}
                />
                <span>Full installation (BG1 + BG2)</span>
              </label>
            </fieldset>
          ) : null}
        </div>
        <div className="confirm-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => onConfirm(eetMode ? scope : 'full')}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
