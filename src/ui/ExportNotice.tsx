interface Props {
  visible: boolean
  lineCount: number
  onDismiss: () => void
}

/** Calm confirmation after exporting install-order.txt. */
export function ExportNotice({ visible, lineCount, onDismiss }: Props) {
  if (!visible) return null

  return (
    <aside className="export-notice" role="status" aria-live="polite">
      <div className="export-notice-text">
        <p className="export-notice-title">Install order downloaded</p>
        <p className="export-notice-body">
          {lineCount === 0
            ? 'Saved an empty install-order.txt.'
            : `${lineCount} component${lineCount === 1 ? '' : 's'} written to install-order.txt.`}
        </p>
      </div>
      <button
        type="button"
        className="btn secondary export-notice-dismiss"
        onClick={onDismiss}
      >
        OK
      </button>
    </aside>
  )
}
