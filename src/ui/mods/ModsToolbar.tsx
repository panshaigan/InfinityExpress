import { useState } from 'react'
import {
  diskStatusLabel,
  GAME_FILTER_OPTIONS,
  type ModsTableFilters,
} from '../../lib/mods/modsTable'
import type { DiskStatus } from '../../lib/mods/loadMods'
import { OutlinedSelect } from '../OutlinedSelect'

interface FacetOptions {
  categories: string[]
  authors: string[]
}

interface Props {
  filters: ModsTableFilters
  onChange: (next: ModsTableFilters) => void
  facets: FacetOptions
  neededCodenames: string[]
  journeyLocked: boolean
  selectedCount: number
  visibleCount: number
  totalCount: number
  acquireLabel: string
  acquireDisabled: boolean
  onAcquire: () => void
  onCheckUpdates: () => void
  onRemoveFromDisk: () => void
  onExportCsv: () => void
  onAddMod: () => void
  onContinueBrowsing: () => void
  notice: string | null
  jobMinimized: boolean
  jobRunning: boolean
  jobSummary: string | null
  onRestoreJob: () => void
}

const ALL_STATUSES: DiskStatus[] = [
  'not_present',
  'present',
  'update_available',
  'busy',
]

type FacetId = 'category' | 'game' | 'author' | 'status'

export const MODS_SEARCH_ID = 'mods-search'

export function ModsToolbar({
  filters,
  onChange,
  facets,
  neededCodenames,
  journeyLocked,
  selectedCount,
  visibleCount,
  totalCount,
  acquireLabel,
  acquireDisabled,
  onAcquire,
  onCheckUpdates,
  onRemoveFromDisk,
  onExportCsv,
  onAddMod,
  onContinueBrowsing,
  notice,
  jobMinimized,
  jobRunning,
  jobSummary,
  onRestoreJob,
}: Props) {
  const bulkDisabled = selectedCount === 0
  const onlyNeededActive = filters.requiredCodenames != null
  const hasFacetFilters =
    filters.categories.length > 0 ||
    filters.games.length > 0 ||
    filters.authors.length > 0 ||
    filters.statuses.length > 0 ||
    !!filters.search.trim() ||
    (onlyNeededActive && !journeyLocked)
  const [openFacet, setOpenFacet] = useState<FacetId | null>(null)

  function toggleOnlyNeeded() {
    if (journeyLocked) return
    if (onlyNeededActive) {
      onChange({ ...filters, requiredCodenames: null })
      return
    }
    if (neededCodenames.length === 0) return
    onChange({ ...filters, requiredCodenames: neededCodenames })
  }

  function facetOpenChange(id: FacetId, open: boolean) {
    setOpenFacet(open ? id : null)
  }

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
            id={MODS_SEARCH_ID}
            type="search"
            placeholder="Search name, author, download id…"
            value={filters.search}
            autoComplete="off"
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
            className="btn secondary has-icon-tip"
            disabled={bulkDisabled || acquireDisabled}
            onClick={onAcquire}
          >
            {acquireLabel}
            <span className="icon-tip" role="tooltip">
              Download missing mods and update outdated ones in the selection
            </span>
          </button>
          <button
            type="button"
            className="btn secondary has-icon-tip"
            disabled={bulkDisabled}
            onClick={onCheckUpdates}
          >
            Check for updates
            <span className="icon-tip" role="tooltip">
              Probe remote versions for the selection
            </span>
          </button>
          <button
            type="button"
            className="btn secondary has-icon-tip"
            disabled={bulkDisabled}
            onClick={onRemoveFromDisk}
          >
            Remove from disk
            <span className="icon-tip" role="tooltip">
              Delete selected mod folders from the download directory
            </span>
          </button>
          <button
            type="button"
            className="btn secondary has-icon-tip"
            onClick={onExportCsv}
          >
            Export CSV
            <span className="icon-tip" role="tooltip">
              Export the current catalog (with overlays) as CSV
            </span>
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

      {jobMinimized ? (
        <div className="mods-job-chip-row">
          <button
            type="button"
            className={`mods-job-chip${jobRunning ? ' running' : ''}`}
            onClick={onRestoreJob}
          >
            {jobRunning
              ? 'Job running — show progress'
              : jobSummary
                ? `Job finished — ${jobSummary}`
                : 'Show job log'}
          </button>
        </div>
      ) : null}

      {!journeyLocked ? (
        <div className="mods-facets">
          <OutlinedSelect
            label="Category"
            value={filters.categories[0] ?? ''}
            open={openFacet === 'category'}
            onOpenChange={(open) => facetOpenChange('category', open)}
            onChange={(next) =>
              onChange({
                ...filters,
                categories: next ? [next] : [],
              })
            }
            options={[
              { value: '', label: 'All' },
              ...facets.categories.map((c) => ({ value: c, label: c })),
            ]}
          />
          <OutlinedSelect
            label="Game"
            value={filters.games[0] ?? ''}
            open={openFacet === 'game'}
            onOpenChange={(open) => facetOpenChange('game', open)}
            onChange={(next) =>
              onChange({
                ...filters,
                games: next ? [next] : [],
              })
            }
            options={[
              { value: '', label: 'All' },
              ...GAME_FILTER_OPTIONS.map((g) => ({ value: g, label: g })),
            ]}
          />
          <OutlinedSelect
            label="Author"
            value={filters.authors[0] ?? ''}
            open={openFacet === 'author'}
            onOpenChange={(open) => facetOpenChange('author', open)}
            onChange={(next) =>
              onChange({
                ...filters,
                authors: next ? [next] : [],
              })
            }
            options={[
              { value: '', label: 'All' },
              ...facets.authors.map((a) => ({ value: a, label: a })),
            ]}
          />
          <OutlinedSelect
            label="Status"
            value={filters.statuses[0] ?? ''}
            open={openFacet === 'status'}
            onOpenChange={(open) => facetOpenChange('status', open)}
            onChange={(next) =>
              onChange({
                ...filters,
                statuses: next ? [next as DiskStatus] : [],
              })
            }
            options={[
              { value: '', label: 'All' },
              ...ALL_STATUSES.map((s) => ({
                value: s,
                label: diskStatusLabel(s),
              })),
            ]}
          />
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
                  requiredCodenames: null,
                })
              }
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            className={`filter-chip mods-only-needed${onlyNeededActive ? ' active' : ''}`}
            aria-pressed={onlyNeededActive}
            disabled={neededCodenames.length === 0 && !onlyNeededActive}
            onClick={toggleOnlyNeeded}
          >
            Only needed
          </button>
        </div>
      ) : (
        <div className="mods-facets mods-facets-locked">
          <button
            type="button"
            className="filter-chip mods-only-needed active"
            aria-pressed={true}
            disabled
          >
            Only needed
          </button>
        </div>
      )}

      {notice ? (
        <p className="mods-stub-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
