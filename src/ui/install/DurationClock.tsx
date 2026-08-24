import { playerDurationParts } from '../../lib/install/formatDuration'

export function DurationClock({ ms }: { ms: number | null }) {
  if (ms == null) return <span className="install-duration">—</span>
  const { hours, minutes, seconds } = playerDurationParts(ms)
  const hoursSet = hours > 0
  const minutesSet = hoursSet || minutes > 0
  return (
    <span className="install-duration">
      <span className={`install-duration-h${hoursSet ? ' is-set' : ''}`}>{hours}</span>
      <span className="install-duration-sep">:</span>
      <span className={`install-duration-m${minutesSet ? ' is-set' : ''}`}>
        {String(minutes).padStart(2, '0')}
      </span>
      <span className="install-duration-sep">:</span>
      <span className="install-duration-s">{String(seconds).padStart(2, '0')}</span>
    </span>
  )
}
