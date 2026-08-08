import { useEffect, useId, useRef } from 'react'
import type { SizeConfirmState } from '../../hooks/useModAcquireJob'

interface Props {
  state: SizeConfirmState | null
  onCancel: () => void
  onConfirm: () => void
}

export function AcquireSizeConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!state) return
    confirmRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, onCancel])

  if (!state) return null

  return (
    <div
      className="keyboard-help-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="keyboard-help acquire-size-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id={titleId}>Download / update?</h2>
        </div>
        <p className="keyboard-help-lede">
          About to fetch <strong>{state.targets.length}</strong> mod
          {state.targets.length === 1 ? '' : 's'}. Estimated total download size:{' '}
          <strong>{state.totalLabel}</strong>
          {state.detail ? `. ${state.detail}` : ''}.
        </p>
        <ul className="acquire-size-list">
          {state.targets.slice(0, 12).map((m) => (
            <li key={m.codename}>{m.codename}</li>
          ))}
          {state.targets.length > 12 ? (
            <li>…and {state.targets.length - 12} more</li>
          ) : null}
        </ul>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="btn"
            onClick={onConfirm}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
