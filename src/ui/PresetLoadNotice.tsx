interface Props {
  visible: boolean
  presetName: string
  added: number
  removed: number
  onDismiss: () => void
}

/** Brief summary after loading a selection preset. */
export function PresetLoadNotice({
  visible,
  presetName,
  added,
  removed,
  onDismiss,
}: Props) {
  if (!visible) return null

  const parts: string[] = []
  if (added > 0) parts.push(`+${added} added`)
  if (removed > 0) parts.push(`−${removed} removed`)
  const delta =
    parts.length > 0
      ? parts.join(' · ')
      : 'selection unchanged'

  return (
    <aside className="preset-load-notice" role="status" aria-live="polite">
      <div className="preset-load-notice-text">
        <p className="preset-load-notice-title">Loaded {presetName}</p>
        <p className="preset-load-notice-body">{delta}</p>
      </div>
      <button
        type="button"
        className="btn secondary preset-load-notice-dismiss"
        onClick={onDismiss}
      >
        OK
      </button>
    </aside>
  )
}
