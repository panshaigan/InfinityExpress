import {
  STATION_LABELS,
  STATION_ORDER,
  type SelectedGame,
  type StationId,
} from '../lib/xml/schema'
import type { StationSlot } from '../lib/ui/chromeHotkeys'

export type AppNavSlot = 'engine' | 'search' | StationId

interface Props {
  game: SelectedGame | null
  activeStation: AppNavSlot
  visibleStations: StationId[]
  finishedStations: ReadonlySet<StationSlot>
  finishedCount: number
  totalCount: number
  onSelectEngine: () => void
  onSelectStation: (id: StationId) => void
  onSelectSearch: () => void
}

function stationClass(
  id: Exclude<AppNavSlot, 'search'>,
  activeStation: AppNavSlot,
  finishedStations: ReadonlySet<StationSlot>,
): string {
  const parts: string[] = []
  if (activeStation === id) parts.push('active')
  if (finishedStations.has(id)) parts.push('finished')
  return parts.join(' ')
}

export function StationNav({
  game,
  activeStation,
  visibleStations,
  finishedStations,
  finishedCount,
  totalCount,
  onSelectEngine,
  onSelectStation,
  onSelectSearch,
}: Props) {
  const progressRatio = totalCount > 0 ? finishedCount / totalCount : 0

  return (
    <nav className="station-nav" aria-label="Stations">
      <div className="station-nav-scroll">
        <button
          type="button"
          className={stationClass('engine', activeStation, finishedStations)}
          onClick={onSelectEngine}
        >
          <span className="station-nav-label">Engine</span>
          {finishedStations.has('engine') && (
            <span className="station-finished-mark" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
        <button
          type="button"
          className={activeStation === 'search' ? 'active' : ''}
          disabled={!game}
          onClick={onSelectSearch}
          title="Search every eligible component"
        >
          <span className="station-nav-label">Search</span>
        </button>
        {STATION_ORDER.filter((id) => visibleStations.includes(id)).map((id) => (
          <button
            key={id}
            type="button"
            className={stationClass(id, activeStation, finishedStations)}
            disabled={!game}
            onClick={() => onSelectStation(id)}
          >
            <span className="station-nav-label">{STATION_LABELS[id]}</span>
            {finishedStations.has(id) && (
              <span className="station-finished-mark" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      {game && totalCount > 0 && (
        <div
          className="station-nav-progress"
          aria-label={`Route progress: ${finishedCount} of ${totalCount} stops done`}
        >
          <div className="station-nav-progress-bar" aria-hidden="true">
            <div
              className="station-nav-progress-fill"
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </div>
          <span className="station-nav-progress-label">
            {finishedCount}/{totalCount} done
          </span>
        </div>
      )}
    </nav>
  )
}
