interface Props {
  canCycle: boolean
  /** When false and not finished, OK is disabled (e.g. Engine with no game). */
  canOk: boolean
  /** Current station already marked finished — show Cancel instead of OK. */
  finished: boolean
  onPrevious: () => void
  onNext: () => void
  onOk: () => void
  onCancel: () => void
}

/** Previous / Next / OK|Cancel cluster for station headers and Engine. */
export function ScreenNavButtons({
  canCycle,
  canOk,
  finished,
  onPrevious,
  onNext,
  onOk,
  onCancel,
}: Props) {
  return (
    <div className="screen-nav-buttons">
      <button
        type="button"
        className="btn"
        disabled={!canCycle}
        onClick={onPrevious}
      >
        Previous
      </button>
      <button type="button" className="btn" disabled={!canCycle} onClick={onNext}>
        Next
      </button>
      {finished ? (
        <button
          type="button"
          className="btn screen-nav-ok-btn"
          onClick={onCancel}
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          className="btn screen-nav-ok-btn"
          disabled={!canOk}
          onClick={onOk}
        >
          OK
        </button>
      )}
    </div>
  )
}
