import { useEffect, useRef, useState } from 'react'
import { useBackdropDismiss } from '../backdropDismiss'
import { OutlinedTextField } from '../OutlinedTextField'

interface Props {
  open: boolean
  gameLabel: string
  initialName: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function PlanSnapshotDialog({
  open,
  gameLabel,
  initialName,
  onConfirm,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const backdrop = useBackdropDismiss(onCancel)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setError(null)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, initialName, onCancel])

  if (!open) return null

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a snapshot name.')
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
          <h2 id="plan-snapshot-dialog-title">Plan snapshot</h2>
        </div>
        <p id="plan-snapshot-dialog-message" className="confirm-dialog-message">
          Copies {gameLabel} before this step, then installation continues.
        </p>
        <OutlinedTextField
          label="Snapshot name"
          value={name}
          onChange={(value) => {
            setName(value)
            setError(null)
          }}
          required
          error={error}
          inputRef={inputRef}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="confirm-dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={submit}>
            Plan snapshot
          </button>
        </div>
      </div>
    </div>
  )
}
