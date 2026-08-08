import { formatBytes, type SizeBounds } from '../../lib/mods/loadMods'

interface Props {
  sizeBounds: SizeBounds | null
  min: number
  max: number
  onSetMin: (value: number) => void
  onSetMax: (value: number) => void
}

export function SizeFilterPanel({
  sizeBounds,
  min,
  max,
  onSetMin,
  onSetMax,
}: Props) {
  if (!sizeBounds) {
    return <p className="filter-panel-empty">No size data in mods.csv.</p>
  }

  return (
    <div className="filter-size">
      <div className="filter-size-labels">
        <span>{formatBytes(min)}</span>
        <span>—</span>
        <span>{formatBytes(max)}</span>
      </div>
      <div className="filter-size-slider">
        <input
          type="range"
          className="filter-size-range filter-size-range-min"
          min={sizeBounds.min}
          max={sizeBounds.max}
          value={min}
          aria-label="Minimum size"
          onChange={(e) => onSetMin(Number(e.target.value))}
        />
        <input
          type="range"
          className="filter-size-range filter-size-range-max"
          min={sizeBounds.min}
          max={sizeBounds.max}
          value={max}
          aria-label="Maximum size"
          onChange={(e) => onSetMax(Number(e.target.value))}
        />
      </div>
      <div className="filter-size-bounds">
        <span>{formatBytes(sizeBounds.min)}</span>
        <span>{formatBytes(sizeBounds.max)}</span>
      </div>
    </div>
  )
}
