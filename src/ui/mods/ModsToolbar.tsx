import {
  diskStatusLabel,
  type ModsTableFilters,
} from '../../lib/mods/modsTable'
import type { DiskStatus } from '../../lib/mods/loadMods'

interface FacetOptions {
  categories: string[]
  games: string[]
  authors: string[]
}

interface Props {
  filters: ModsTableFilters
  onChange: (next: ModsTableFilters) => void
  facets: FacetOptions
  journeyLocked: boolean
  selectedCount: number
  visibleCount: number
  totalCount: number
  onDownload: () => void
  onCheckUpdates: () => void
  onUpdate: () => void
  onRemoveFromDisk: () => void
  onAddMod: () => void
  onContinueBrowsing: () => void
  stubNotice: string | null
}

const ALL_STATUSES: DiskStatus[] = [
  'not_present',
  'present',
  'update_available',
  'busy',
]

export function ModsToolbar({
  filters,
  onChange,
  facets,
  journeyLocked,
  selectedCount,
  visibleCount,
  totalCount,
  onDownload,
  onCheckUpdates,
  onUpdate,
  onRemoveFromDisk,
  onAddMod,
  onContinueBrowsing,
  stubNotice,
}: Props) {
  const bulkDisabled = selectedCount === 0
  const hasFacetFilters =
    filters.categories.length > 0 ||
    filters.games.length > 0 ||
    filters.authors.length > 0 ||
    filters.statuses.length > 0 ||
    !!filters.search.trim()

  return (
    <div className="mods-toolbar">
      {journeyLocked ? (
        <div className="mods-journey-banner" role="status">
          <div className="mods-journey-banner-text">
            <strong>Needed for your route</strong>
            <span>
              These mods are required by your component selection. Selection is
              locked until you continue browsing.
            </span>
          </div>
          <button
            type="button"
            className="btn secondary"
            onClick={onContinueBrowsing}
          >
            Continue browsing
          </button>
        </div>
      ) : null}

      <div className="mods-toolbar-row">
        <label className="mods-search">
          <span className="visually-hidden">Search mods</span>
          <input
            type="search"
            placeholder="Search name, author, codename…"
            value={filters.search}
            disabled={journeyLocked}
            onChange={(e) =>
              onChange({ ...filters, search: e.target.value })
            }
          />
        </label>
        <span className="mods-count" aria-live="polite">
          {visibleCount} of {totalCount}
          {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
        </span>
        <div className="mods-toolbar-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={bulkDisabled}
            title="Desktop app will download selected mods"
            onClick={onDownload}
          >
            Download
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={bulkDisabled}
            title="Desktop app will check remote versions"
            onClick={onCheckUpdates}
          >
            Check for updates
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={bulkDisabled}
            title="Desktop app will update selected mods"
            onClick={onUpdate}
          >
            Update
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={bulkDisabled}
            title="Desktop app will remove files from disk"
            onClick={onRemoveFromDisk}
          >
            Remove from disk
          </button>
          <button
            type="button"
            className="btn"
            disabled={journeyLocked}
            onClick={onAddMod}
          >
            Add mod
          </button>
        </div>
      </div>

      {!journeyLocked ? (
        <div className="mods-facets">
          <label>
            <span>Category</span>
            <select
              value={filters.categories[0] ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  categories: e.target.value ? [e.target.value] : [],
                })
              }
            >
              <option value="">All</option>
              {facets.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Game</span>
            <select
              value={filters.games[0] ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  games: e.target.value ? [e.target.value] : [],
                })
              }
            >
              <option value="">All</option>
              {facets.games.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Author</span>
            <select
              value={filters.authors[0] ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  authors: e.target.value ? [e.target.value] : [],
                })
              }
            >
              <option value="">All</option>
              {facets.authors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={filters.statuses[0] ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  statuses: e.target.value
                    ? [e.target.value as DiskStatus]
                    : [],
                })
              }
            >
              <option value="">All</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {diskStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {hasFacetFilters ? (
            <button
              type="button"
              className="btn secondary mods-clear-filters"
              onClick={() =>
                onChange({
                  ...filters,
                  search: '',
                  categories: [],
                  games: [],
                  authors: [],
                  statuses: [],
                })
              }
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mods-facets mods-facets-locked">
          <span className="mods-locked-chip">Needed for your route</span>
        </div>
      )}

      {stubNotice ? (
        <p className="mods-stub-notice" role="status">
          {stubNotice}
        </p>
      ) : null}
    </div>
  )
}
