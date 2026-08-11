import {
  STATION_LABELS,
  STATION_ORDER,
  type SelectedGame,
  type StationId,
} from '../lib/xml/schema'
import { isSetupSlot, type StationSlot } from '../lib/ui/chromeHotkeys'
import { IconTip } from './IconTip'
import { RailCollapseButton } from './RailCollapseButton'

export type AppNavSlot = StationSlot
export { isSetupSlot, type StationSlot } from '../lib/ui/chromeHotkeys'

const SHORT_LABELS: Record<AppNavSlot, string> = {
  engine: 'Eng',
  presets: 'Pre',
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

const SETUP_LABELS: Record<'engine' | 'presets', string> = {
  engine: 'Engine',
  presets: 'Presets',
}

interface Props {
  game: SelectedGame | null
  routeUnlocked: boolean
  activeStation: AppNavSlot
  visibleStations: StationId[]
  finishedStations: ReadonlySet<StationSlot>
  finishedCount: number
  totalCount: number
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelectEngine: () => void
  onSelectPresets: () => void
  onSelectStation: (id: StationId) => void
  onFinishRoute: () => void
  onReopenRoute: () => void
}

function stationClass(
  id: AppNavSlot,
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
    if (isSetupSlot(id)) return SETUP_LABELS[id]
    return STATION_LABELS[id]
  }
  return SHORT_LABELS[id]
}

function titleFor(id: AppNavSlot): string {
  if (isSetupSlot(id)) return SETUP_LABELS[id]
  return STATION_LABELS[id]
}

function StationStop({
  id,
  activeStation,
  finishedStations,
  collapsed,
  disabled,
  onClick,
}: {
  id: AppNavSlot
  activeStation: AppNavSlot
  finishedStations: ReadonlySet<StationSlot>
  collapsed: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const finished = finishedStations.has(id)

  return (
    <button
      type="button"
      className={stationClass(id, activeStation, finishedStations)}
      disabled={disabled}
      onClick={onClick}
      aria-label={titleFor(id)}
    >
      <span className="station-nav-track" aria-hidden="true">
        <span className="station-nav-dot">
          {finished && <span className="station-finished-mark">✓</span>}
        </span>
      </span>
      <span className="station-nav-label">{labelFor(id, collapsed)}</span>
    </button>
  )
}

export function StationNav({
  game,
  routeUnlocked,
  activeStation,
  visibleStations,
  finishedStations,
  finishedCount,
  totalCount,
  collapsed,
  onToggleCollapsed,
  onSelectEngine,
  onSelectPresets,
  onSelectStation,
  onFinishRoute,
  onReopenRoute,
}: Props) {
  const progressRatio = totalCount > 0 ? finishedCount / totalCount : 0
  const allDone = totalCount > 0 && finishedCount === totalCount
  const showRouteChrome = routeUnlocked && !!game && totalCount > 0

  return (
    <nav
      className={`station-nav${collapsed ? ' collapsed' : ''}`}
      aria-label="Stations"
    >
      <div className="station-nav-scroll">
        <StationStop
          id="engine"
          activeStation={activeStation}
          finishedStations={finishedStations}
          collapsed={collapsed}
          onClick={onSelectEngine}
        />
        {routeUnlocked ? (
          <>
            <StationStop
              id="presets"
              activeStation={activeStation}
              finishedStations={finishedStations}
              collapsed={collapsed}
              onClick={onSelectPresets}
            />
            {STATION_ORDER.filter((id) => visibleStations.includes(id)).map((id) => (
              <StationStop
                key={id}
                id={id}
                activeStation={activeStation}
                finishedStations={finishedStations}
                collapsed={collapsed}
                onClick={() => onSelectStation(id)}
              />
            ))}
          </>
        ) : null}
      </div>
      <div className="station-nav-footer">
        <RailCollapseButton collapsed={collapsed} onToggle={onToggleCollapsed} />
      </div>
      {showRouteChrome ? (
        <>
          <div className="station-nav-finish">
            <span className="has-icon-tip">
              {allDone ? (
                <button
                  type="button"
                  className="btn station-nav-finish-btn"
                  onClick={onReopenRoute}
                  aria-label="Reopen route"
                >
                  {collapsed ? '↺' : 'Reopen route'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn station-nav-finish-btn"
                  onClick={onFinishRoute}
                  aria-label="Finish route"
                >
                  {collapsed ? '✓' : 'Finish route'}
                </button>
              )}
              <IconTip>
                {allDone ? 'Clear all station done marks' : 'Mark all stations done'}
              </IconTip>
            </span>
          </div>
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
        </>
      ) : null}
    </nav>
  )
}
