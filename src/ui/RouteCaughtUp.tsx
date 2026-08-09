import { IconTip } from './IconTip'

interface Props {
  visible: boolean
  selectedCount: number
  onOpenMods: () => void
  onExport: () => void
  onDismiss: () => void
}

/** Soft completion banner when every station is marked done. */
export function RouteCaughtUp({
  visible,
  selectedCount,
  onOpenMods,
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
          . Next, review the mods your route needs — or export the install order.
        </p>
      </div>
      <div className="route-caught-up-actions">
        <button type="button" className="btn" onClick={onOpenMods}>
          Open Mods
        </button>
        <span className="has-icon-tip">
          <button
            type="button"
            className="btn secondary"
            disabled={selectedCount === 0}
            onClick={onExport}
          >
            Export
          </button>
          <IconTip>
            {selectedCount === 0
              ? 'Select at least one component to export'
              : 'Preview and save install order'}
          </IconTip>
        </span>
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
