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
  onSelectEngine: () => void
  onSelectSearch: () => void
  onSelectStation: (id: StationId) => void
}

function stationClass(
  id: AppNavSlot,
  activeStation: AppNavSlot,
  finishedStations: ReadonlySet<StationSlot>,
): string {
  const parts: string[] = []
  if (activeStation === id) parts.push('active')
  if (id !== 'search' && finishedStations.has(id as StationSlot)) {
    parts.push('finished')
  }
  return parts.join(' ')
}

export function StationNav({
  game,
  activeStation,
  visibleStations,
  finishedStations,
  onSelectEngine,
  onSelectSearch,
  onSelectStation,
}: Props) {
  return (
    <nav className="station-nav" aria-label="Stations">
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
        className={stationClass('search', activeStation, finishedStations)}
        disabled={!game}
        onClick={onSelectSearch}
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
    </nav>
  )
}
