interface Props {
  visible: boolean
  onDismiss: () => void
}

export function RouteGuideTip({ visible, onDismiss }: Props) {
  if (!visible) return null

  return (
    <aside className="route-tip" aria-label="Getting started">
      <p className="route-tip-text">
        <strong>Done</strong> walks you stop by stop.
        The left rail always lets you jump freely.
      </p>
      <button
        type="button"
        className="route-tip-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss tip"
      >
        Got it
      </button>
    </aside>
  )
}

const STORAGE_KEY = 'infinity-express.route-tip-dismissed'

export function readRouteTipDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeRouteTipDismissed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* private mode / blocked storage */
  }
}
