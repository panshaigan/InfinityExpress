interface Props {
  canCycle: boolean
  canOk: boolean
  onPrevious: () => void
  onNext: () => void
  onOk: () => void
}

/** Previous / Next / OK cluster for station headers and Engine. */
export function ScreenNavButtons({
  canCycle,
  canOk,
  onPrevious,
  onNext,
  onOk,
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
      <button
        type="button"
        className="btn screen-nav-ok-btn"
        disabled={!canOk}
        onClick={onOk}
      >
        OK
      </button>
    </div>
  )
}
