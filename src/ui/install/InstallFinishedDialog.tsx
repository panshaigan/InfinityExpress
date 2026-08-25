import { useEffect, useRef, useState } from 'react'
import { useBackdropDismiss } from '../backdropDismiss'
import type { InstallFinishedSummary } from '../../lib/install/installFinished'
import {
  CLEANUP_ARTIFACT_OPTIONS,
  defaultCleanupSelection,
  hasAnyCleanupSelection,
  type CleanupSelection,
} from '../../lib/install/cleanupOptions'

interface Props {
  open: boolean
  summary: InstallFinishedSummary | null
  busy?: boolean
  error?: string | null
  /** Show EET-only “whole BG1 folder” option. */
  showBg1Folder?: boolean
  bg1Path?: string
  onClean: (selection: CleanupSelection) => void
  onClose: () => void
}

export function InstallFinishedDialog({
  open,
  summary,
  busy = false,
  error = null,
  showBg1Folder = false,
  bg1Path = '',
  onClean,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdrop = useBackdropDismiss(busy ? undefined : onClose)
  const [selection, setSelection] = useState<CleanupSelection>(defaultCleanupSelection)

  useEffect(() => {
    if (!open) return
    setSelection(defaultCleanupSelection())
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

  const canClean = hasAnyCleanupSelection(selection, { showBg1Folder }) && !busy

  function toggle<K extends keyof CleanupSelection>(id: K, checked: boolean) {
    setSelection((prev) => ({ ...prev, [id]: checked }))
  }

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
            Choose what to remove from the game folder
            {summary.folders.length > 1 ? 's' : ''}. WeiDU.log and installed
            override content stay in place
            {showBg1Folder ? ' (unless you delete the whole BG1 folder)' : ''}.
          </p>
          <fieldset className="backup-include-fieldset install-cleanup-fieldset" disabled={busy}>
            <legend>Clean up</legend>
            {CLEANUP_ARTIFACT_OPTIONS.map((opt) => (
              <label key={opt.id} className="install-filter-toggle">
                <input
                  type="checkbox"
                  checked={selection[opt.id]}
                  onChange={(e) => toggle(opt.id, e.target.checked)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
            {showBg1Folder ? (
              <label className="install-filter-toggle">
                <input
                  type="checkbox"
                  checked={selection.bg1Folder}
                  onChange={(e) => toggle('bg1Folder', e.target.checked)}
                />
                <span>
                  Whole BG1 game folder
                  {bg1Path.trim() ? (
                    <>
                      {' '}
                      (<code className="install-cleanup-bg1-path">{bg1Path.trim()}</code>)
                    </>
                  ) : null}
                </span>
              </label>
            ) : null}
          </fieldset>
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
            disabled={!canClean}
            onClick={() => onClean(selection)}
          >
            {busy ? 'Cleaning…' : 'Clean game folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
