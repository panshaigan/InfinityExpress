import { useEffect, useRef, useState } from 'react'
import type { BackupProgress } from '../../lib/desktop/weiduInstall'
import { useBackdropDismiss } from '../backdropDismiss'
import { OutlinedTextField } from '../OutlinedTextField'
import { BackupProgressBlock } from './BackupProgressBlock'

interface Props {
  open: boolean
  title?: string
  message?: string
  confirmLabel?: string
  gameLabel: string
  initialName: string
  busy?: boolean
  progress?: BackupProgress | null
  error?: string | null
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function PlanSnapshotDialog({
  open,
  title = 'Plan snapshot',
  message,
  confirmLabel = 'Plan snapshot',
  gameLabel,
  initialName,
  busy = false,
  progress = null,
  error = null,
  onConfirm,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName)
  const [nameError, setNameError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const backdrop = useBackdropDismiss(busy ? undefined : onCancel)
  const description =
    message ?? `Copies ${gameLabel} before this step, then installation continues.`

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setNameError(null)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open, initialName])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (busy) return
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null

  function submit() {
    if (busy) return
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Enter a snapshot name.')
      return
    }
    onConfirm(trimmed)
  }

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      {...backdrop}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-snapshot-dialog-title"
        aria-describedby="plan-snapshot-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <h2 id="plan-snapshot-dialog-title">{title}</h2>
        </div>
        <p id="plan-snapshot-dialog-message" className="confirm-dialog-message">
          {description}
        </p>
        <OutlinedTextField
          label="Snapshot name"
          value={name}
          onChange={(value) => {
            setName(value)
            setNameError(null)
          }}
          required
          error={nameError}
          inputRef={inputRef}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        <BackupProgressBlock progress={progress} />
        {error ? <p className="install-dialog-error">{error}</p> : null}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="btn secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="button" className="btn" onClick={submit} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
