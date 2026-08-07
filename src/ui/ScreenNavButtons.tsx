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
        className="btn secondary"
        disabled={!canCycle}
        onClick={onPrevious}
        title="Go to the previous unfinished stop"
      >
        Previous
      </button>
      <button
        type="button"
        className="btn secondary"
        disabled={!canCycle}
        onClick={onNext}
        title="Go to the next unfinished stop"
      >
        Next
      </button>
      {finished ? (
        <button
          type="button"
          className="btn screen-nav-ok-btn"
          onClick={onCancel}
          title="Mark this stop unfinished again"
        >
          Reopen
        </button>
      ) : (
        <button
          type="button"
          className="btn screen-nav-ok-btn"
          disabled={!canOk}
          onClick={onOk}
          title="Mark this stop finished and continue"
        >
          Done
        </button>
      )}
    </div>
  )
}
