interface Props {
  visible: boolean
  onDismiss: () => void
}

export function RouteGuideTip({ visible, onDismiss }: Props) {
  if (!visible) return null

  return (
    <aside className="route-tip" aria-label="Getting started">
      <p className="route-tip-text">
        <strong>"Done" buttons</strong> walks you stop by stop.
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

