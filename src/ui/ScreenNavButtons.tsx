import { IconTip } from './IconTip'

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
      <span className="has-icon-tip">
        <button
          type="button"
          className="btn secondary"
          disabled={!canCycle}
          onClick={onPrevious}
        >
          Previous
        </button>
        <IconTip>Go to the previous unfinished stop</IconTip>
      </span>
      <span className="has-icon-tip">
        <button
          type="button"
          className="btn secondary"
          disabled={!canCycle}
          onClick={onNext}
        >
          Next
        </button>
        <IconTip>Go to the next unfinished stop</IconTip>
      </span>
      {finished ? (
        <span className="has-icon-tip">
          <button type="button" className="btn screen-nav-ok-btn" onClick={onCancel}>
            Reopen
          </button>
          <IconTip align="end">Mark this stop unfinished again</IconTip>
        </span>
      ) : (
        <span className="has-icon-tip">
          <button
            type="button"
            className="btn screen-nav-ok-btn"
            disabled={!canOk}
            onClick={onOk}
          >
            Done
          </button>
          <IconTip align="end">Mark this stop finished and continue</IconTip>
        </span>
      )}
    </div>
  )
}
