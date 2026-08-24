import { useEffect, useRef } from 'react'
import { useBackdropDismiss } from '../backdropDismiss'
import type { InstallFinishedSummary } from '../../lib/install/installFinished'

interface Props {
  open: boolean
  summary: InstallFinishedSummary | null
  busy?: boolean
  error?: string | null
  onClean: () => void
  onClose: () => void
}

export function InstallFinishedDialog({
  open,
  summary,
  busy = false,
  error = null,
  onClean,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdrop = useBackdropDismiss(busy ? undefined : onClose)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open || !summary) return null

  return (
    <div className="confirm-dialog-backdrop" role="presentation" {...backdrop}>
      <div
        className="confirm-dialog install-finished-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-finished-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <h2 id="install-finished-title">Installation finished</h2>
        </div>
        <div className="confirm-dialog-message">
          <p>The last component in the install order has been processed.</p>
          <dl className="install-finished-stats">
            <div>
              <dt>Duration</dt>
              <dd>{summary.durationLabel}</dd>
            </div>
            <div>
              <dt>Installed</dt>
              <dd>{summary.installed}</dd>
            </div>
            <div>
              <dt>With warnings</dt>
              <dd>{summary.withWarnings}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{summary.skipped}</dd>
            </div>
            <div>
              <dt>Already installed</dt>
              <dd>{summary.alreadyInstalled}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{summary.failed}</dd>
            </div>
            <div>
              <dt>Total steps</dt>
              <dd>{summary.total}</dd>
            </div>
          </dl>
          {summary.folders.length > 0 ? (
            <div className="install-finished-folders">
              <p>Game folder{summary.folders.length > 1 ? 's' : ''}</p>
              <ul>
                {summary.folders.map((folder) => (
                  <li key={folder.path}>
                    <span className="install-finished-folder-label">{folder.label}</span>
                    <code>{folder.path}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p>
            Cleaning removes copied mod folders, <code>setup-*.exe</code>, and{' '}
            <code>*.DEBUG</code> from the game folder
            {summary.folders.length > 1 ? 's' : ''}. WeiDU.log and the installed
            override stay in place.
          </p>
          {error ? <p className="install-dialog-error">{error}</p> : null}
        </div>
        <div className="confirm-dialog-actions">
          <button
            ref={closeRef}
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={onClean}
          >
            {busy ? 'Cleaning…' : 'Clean game folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
