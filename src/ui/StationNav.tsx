import {
  STATION_LABELS,
  STATION_ORDER,
  type SelectedGame,
  type StationId,
} from '../lib/xml/schema'
import type { StationSlot } from '../lib/ui/chromeHotkeys'

export type AppNavSlot = 'engine' | 'search' | StationId

const SHORT_LABELS: Record<Exclude<AppNavSlot, 'search'> | 'search', string> = {
  engine: 'Eng',
  search: 'Find',
  base: 'Base',
  ui: 'UI',
  campaigns: 'Camp',
  gfx: 'GFX',
  content: 'Cont',
  mechanics: 'Mech',
  spells: 'Spell',
  npcChoices: 'NPC',
  combat: 'Cbt',
  sounds: 'Snd',
  portraits: 'Port',
  scripts: 'Scr',
  randomisation: 'Rand',
  adjustements: 'Adj',
}

interface Props {
  game: SelectedGame | null
  activeStation: AppNavSlot
  visibleStations: StationId[]
  finishedStations: ReadonlySet<StationSlot>
  finishedCount: number
  totalCount: number
  collapsed: boolean
  onToggleCollapsed: () => void
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

function labelFor(id: AppNavSlot, collapsed: boolean): string {
  if (!collapsed) {
    if (id === 'engine') return 'Engine'
    if (id === 'search') return 'Search'
    return STATION_LABELS[id]
  }
  return SHORT_LABELS[id]
}

function titleFor(id: AppNavSlot): string {
  if (id === 'engine') return 'Engine'
  if (id === 'search') return 'Search every eligible component'
  return STATION_LABELS[id]
}

export function StationNav({
  game,
  activeStation,
  visibleStations,
  finishedStations,
  finishedCount,
  totalCount,
  collapsed,
  onToggleCollapsed,
  onSelectEngine,
  onSelectStation,
  onSelectSearch,
}: Props) {
  const progressRatio = totalCount > 0 ? finishedCount / totalCount : 0
  const allDone = totalCount > 0 && finishedCount === totalCount

  return (
    <nav
      className={`station-nav${collapsed ? ' collapsed' : ''}`}
      aria-label="Stations"
    >
      <div className="station-nav-chrome">
        <button
          type="button"
          className="station-nav-collapse"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand station rail (\\)' : 'Collapse station rail (\\)'}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand station rail' : 'Collapse station rail'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <div className="station-nav-scroll">
        <button
          type="button"
          className={stationClass('engine', activeStation, finishedStations)}
          onClick={onSelectEngine}
          title={titleFor('engine')}
        >
          <span className="station-nav-label">{labelFor('engine', collapsed)}</span>
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
          title={titleFor('search')}
        >
          <span className="station-nav-label">{labelFor('search', collapsed)}</span>
        </button>
        {STATION_ORDER.filter((id) => visibleStations.includes(id)).map((id) => (
          <button
            key={id}
            type="button"
            className={stationClass(id, activeStation, finishedStations)}
            disabled={!game}
            onClick={() => onSelectStation(id)}
            title={titleFor(id)}
          >
            <span className="station-nav-label">{labelFor(id, collapsed)}</span>
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
          className={`station-nav-progress${allDone ? ' complete' : ''}`}
          aria-label={
            allDone
              ? `Route complete: all ${totalCount} stops done`
              : `Route progress: ${finishedCount} of ${totalCount} stops done`
          }
        >
          <div className="station-nav-progress-bar" aria-hidden="true">
            <div
              className="station-nav-progress-fill"
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </div>
          <span className="station-nav-progress-label">
            {collapsed
              ? allDone
                ? '✓'
                : `${finishedCount}/${totalCount}`
              : allDone
                ? 'All done'
                : `${finishedCount}/${totalCount} done`}
          </span>
        </div>
      )}
    </nav>
  )
}

const RAIL_STORAGE_KEY = 'infinity-express.rail-collapsed'

export function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeRailCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode / blocked storage */
  }
}
