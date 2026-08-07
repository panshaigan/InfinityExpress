interface Props {
  visible: boolean
  selectedCount: number
  onExport: () => void
  onDismiss: () => void
}

/** Soft completion banner when every station is marked done. */
export function RouteCaughtUp({
  visible,
  selectedCount,
  onExport,
  onDismiss,
}: Props) {
  if (!visible) return null

  return (
    <aside className="route-caught-up" aria-label="Route complete">
      <div className="route-caught-up-text">
        <p className="route-caught-up-title">You are caught up</p>
        <p className="route-caught-up-body">
          Every stop is marked done
          {selectedCount > 0
            ? ` · ${selectedCount} component${selectedCount === 1 ? '' : 's'} selected`
            : ''}
          . Export when ready, or reopen any stop from the rail.
        </p>
      </div>
      <div className="route-caught-up-actions">
        <button
          type="button"
          className="btn"
          disabled={selectedCount === 0}
          onClick={onExport}
          title={
            selectedCount === 0
              ? 'Select at least one component to export'
              : 'Download install-order.txt'
          }
        >
          Export
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={onDismiss}
          aria-label="Dismiss completion message"
        >
          Hide
        </button>
      </div>
    </aside>
  )
}
