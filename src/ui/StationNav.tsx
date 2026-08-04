import {
  STATION_LABELS,
  STATION_ORDER,
  type SelectedGame,
  type StationId,
} from '../lib/xml/schema'

interface Props {
  game: SelectedGame | null
  activeStation: 'engine' | StationId
  visibleStations: StationId[]
  onSelectEngine: () => void
  onSelectStation: (id: StationId) => void
}

export function StationNav({
  game,
  activeStation,
  visibleStations,
  onSelectEngine,
  onSelectStation,
}: Props) {
  return (
    <nav className="station-nav" aria-label="Stations">
      <button
        type="button"
        className={activeStation === 'engine' ? 'active' : ''}
        onClick={onSelectEngine}
      >
        Engine
      </button>
      {STATION_ORDER.filter((id) => visibleStations.includes(id)).map((id) => (
        <button
          key={id}
          type="button"
          className={activeStation === id ? 'active' : ''}
          disabled={!game || activeStation === 'engine'}
          onClick={() => onSelectStation(id)}
        >
          {STATION_LABELS[id]}
        </button>
      ))}
    </nav>
  )
}
