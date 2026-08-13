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
  reopenDisabled?: boolean
}

/** Previous / Done|Reopen / Next cluster for station headers. */
export function ScreenNavButtons({
  canCycle,
  canOk,
  finished,
  onPrevious,
  onNext,
  onOk,
  onCancel,
  reopenDisabled = false,
}: Props) {
  return (
    <div className="screen-nav-buttons" role="group" aria-label="Station progress">
      <span className="has-icon-tip">
        <button
          type="button"
          className="btn secondary screen-nav-step-btn"
          disabled={!canCycle}
          aria-label="Previous"
          onClick={onPrevious}
        >
          ‹
        </button>
        <IconTip>Go to the previous unfinished stop</IconTip>
      </span>
      {finished ? (
        <span className="has-icon-tip">
          <button
            type="button"
            className="btn screen-nav-ok-btn"
            disabled={reopenDisabled}
            onClick={onCancel}
          >
            Reopen
          </button>
          <IconTip>
            {reopenDisabled
              ? 'Cannot reopen while install is running'
              : 'Mark this stop unfinished again'}
          </IconTip>
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
          <IconTip>Mark this stop finished and continue</IconTip>
        </span>
      )}
      <span className="has-icon-tip">
        <button
          type="button"
          className="btn secondary screen-nav-step-btn"
          disabled={!canCycle}
          aria-label="Next"
          onClick={onNext}
        >
          ›
        </button>
        <IconTip align="end">Go to the next unfinished stop</IconTip>
      </span>
    </div>
  )
}
