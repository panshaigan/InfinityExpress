interface Props {
  canCycle: boolean
  /** When false and not finished, Done is disabled (e.g. Engine with no game). */
  canOk: boolean
  /** Current station already marked finished — show Reopen instead of Done. */
  finished: boolean
  onPrevious: () => void
  onNext: () => void
  onOk: () => void
  onCancel: () => void
}

/** Previous / Next / Done|Reopen cluster for station headers and Engine. */
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
    <div className="screen-nav-buttons" role="group" aria-label="Station progress">
      <button
        type="button"
        className="btn secondary has-icon-tip"
        disabled={!canCycle}
        onClick={onPrevious}
      >
        Previous
        <span className="icon-tip icon-tip-below" role="tooltip">
          Go to the previous unfinished stop
        </span>
      </button>
      <button
        type="button"
        className="btn secondary has-icon-tip"
        disabled={!canCycle}
        onClick={onNext}
      >
        Next
        <span className="icon-tip icon-tip-below" role="tooltip">
          Go to the next unfinished stop
        </span>
      </button>
      {finished ? (
        <button
          type="button"
          className="btn screen-nav-ok-btn has-icon-tip"
          onClick={onCancel}
        >
          Reopen
          <span className="icon-tip icon-tip-below" role="tooltip">
            Mark this stop unfinished again
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="btn screen-nav-ok-btn has-icon-tip"
          disabled={!canOk}
          onClick={onOk}
        >
          Done
          <span className="icon-tip icon-tip-below" role="tooltip">
            Mark this stop finished and continue
          </span>
        </button>
      )}
    </div>
  )
}
