import { useState } from 'react'
import {
  diskStatusLabel,
  GAME_FILTER_OPTIONS,
  type ModsTableFilters,
} from '../../lib/mods/modsTable'
import type { DiskStatus } from '../../lib/mods/loadMods'
import { IconTip } from '../IconTip'
import { OutlinedSelect } from '../OutlinedSelect'
import {
  AddModIcon,
  CheckUpdatesIcon,
  ClearFiltersIcon,
  DeleteFromCatalogIcon,
  DownloadIcon,
  ExportCsvIcon,
  OnlyNeededIcon,
  RemoveFromDiskIcon,
} from './ModsActionIcons'

interface FacetOptions {
  categories: string[]
  authors: string[]
}

const ONLY_NEEDED_TIP = 'Only mods required by the selected components'

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
  jobRunning?: boolean
  onAcquire: () => void
  onCheckUpdates: () => void
  onRemoveFromDisk: () => void
  onDeleteFromCatalog: () => void
  onExportCsv: () => void
  onAddMod: () => void
  onContinueBrowsing: () => void
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
  jobRunning = false,
  onAcquire,
  onCheckUpdates,
  onRemoveFromDisk,
  onDeleteFromCatalog,
  onExportCsv,
  onAddMod,
  onContinueBrowsing,
}: Props) {
  const bulkDisabled = selectedCount === 0
  const acquireBusy = jobRunning
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

  const onlyNeededButton = (
    <span className="mods-action-icon-wrap mods-only-needed has-icon-tip">
      <button
        type="button"
        className={`mods-action-icon-btn mods-only-needed-btn${
          onlyNeededActive ? ' active' : ''
        }`}
        aria-pressed={onlyNeededActive}
        aria-label={ONLY_NEEDED_TIP}
        disabled={
          journeyLocked ||
          (neededCodenames.length === 0 && !onlyNeededActive)
        }
        onClick={toggleOnlyNeeded}
      >
        <OnlyNeededIcon />
      </button>
      <IconTip>{ONLY_NEEDED_TIP}</IconTip>
    </span>
  )

  return (
    <div className="mods-toolbar">
      {journeyLocked ? (
        <div className="mods-journey-banner" role="status">
          <div className="mods-journey-banner-text">
            <strong>Needed for your route</strong>
            <span>
              These mods are required by your selected components.
              Please make sure they are all downloaded. You can also
              update the selected mods if needed.
            </span>
          </div>
        </div>
      ) : null}

      <div className="mods-toolbar-row">
        <div className="mods-toolbar-actions">
          <span className="mods-action-icon-wrap has-icon-tip">
            <button
              type="button"
              className="mods-action-icon-btn primary"
              disabled={journeyLocked}
              onClick={onAddMod}
              aria-label="Add mod"
            >
              <AddModIcon />
            </button>
            <IconTip>Add mod</IconTip>
          </span>
          <span className="mods-action-icon-wrap has-icon-tip">
            <button
              type="button"
              className="mods-action-icon-btn"
              disabled={bulkDisabled}
              onClick={onRemoveFromDisk}
              aria-label="Remove from disk"
            >
              <RemoveFromDiskIcon />
            </button>
            <IconTip>Remove from disk</IconTip>
          </span>
          <span className="mods-action-icon-wrap has-icon-tip">
            <button
              type="button"
              className="mods-action-icon-btn"
              disabled={bulkDisabled || journeyLocked}
              onClick={onDeleteFromCatalog}
              aria-label="Remove from catalog"
            >
              <DeleteFromCatalogIcon />
            </button>
            <IconTip>Remove from catalog</IconTip>
          </span>
          <span className="mods-action-icon-wrap has-icon-tip">
            <button
              type="button"
              className="mods-action-icon-btn"
              onClick={onExportCsv}
              aria-label="Export CSV"
            >
              <ExportCsvIcon />
            </button>
            <IconTip>Export CSV</IconTip>
          </span>
          <span className="mods-action-icon-wrap has-icon-tip">
            <button
              type="button"
              className="mods-action-icon-btn"
              disabled={bulkDisabled || acquireBusy}
              onClick={onCheckUpdates}
              aria-label="Check for updates"
            >
              <CheckUpdatesIcon />
            </button>
            <IconTip>Check for updates</IconTip>
          </span>
          <span className="mods-action-icon-wrap has-icon-tip">
            <button
              type="button"
              className="mods-action-icon-btn"
              disabled={bulkDisabled || acquireDisabled || acquireBusy}
              onClick={onAcquire}
              aria-label={acquireLabel}
            >
              <DownloadIcon />
            </button>
            <IconTip>{acquireLabel}</IconTip>
          </span>
          {onlyNeededButton}
        </div>
        <span className="mods-count" aria-live="polite">
          {visibleCount} of {totalCount} mods
          {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
        </span>
      </div>

      {!journeyLocked ? (
        <div className="mods-facets">
          <label className="mods-search">
            <span className="visually-hidden">Search mods</span>
            <input
              id={MODS_SEARCH_ID}
              type="search"
              placeholder="Search..."
              value={filters.search}
              autoComplete="off"
              onChange={(e) =>
                onChange({ ...filters, search: e.target.value })
              }
            />
          </label>
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
              className="filter-clear has-icon-tip mods-clear-filters"
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
              aria-label="Clear filters"
            >
              <ClearFiltersIcon />
              <span className="icon-tip" role="tooltip">
                Clear filters
              </span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mods-facets mods-facets-locked">
          <label className="mods-search">
            <span className="visually-hidden">Search mods</span>
            <input
              id={MODS_SEARCH_ID}
              type="search"
              placeholder="Search..."
              value={filters.search}
              autoComplete="off"
              disabled
              onChange={(e) =>
                onChange({ ...filters, search: e.target.value })
              }
            />
          </label>
        </div>
      )}
    </div>
  )
}
