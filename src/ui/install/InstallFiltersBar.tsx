import { useState } from 'react'
import {
  INSTALL_STATUS_FILTER_OPTIONS,
  STATUS_LABEL,
  createDefaultInstallTableFilters,
  type InstallTableFilters,
} from '../../lib/install/installTable'
import type { ComponentRunStatus } from '../../lib/install/types'
import { OutlinedSelect } from '../OutlinedSelect'
import { ClearFiltersIcon } from '../mods/ModsActionIcons'

export const INSTALL_SEARCH_ID = 'install-search'

interface Props {
  filters: InstallTableFilters
  onChange: (next: InstallTableFilters) => void
  visibleCount: number
  totalCount: number
}

export function InstallFiltersBar({
  filters,
  onChange,
  visibleCount,
  totalCount,
}: Props) {
  const [statusOpen, setStatusOpen] = useState(false)
  const hasFacetFilters =
    filters.statuses.length > 0 || !!filters.search.trim()

  return (
    <div className="mods-facets install-facets">
      <label className="mods-search">
        <span className="visually-hidden">Search install steps</span>
        <input
          id={INSTALL_SEARCH_ID}
          type="search"
          placeholder="Search..."
          value={filters.search}
          autoComplete="off"
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
      <OutlinedSelect
        label="Status"
        value={filters.statuses[0] ?? ''}
        open={statusOpen}
        onOpenChange={setStatusOpen}
        onChange={(next) =>
          onChange({
            ...filters,
            statuses: next ? [next as ComponentRunStatus] : [],
          })
        }
        options={[
          { value: '', label: 'All' },
          ...INSTALL_STATUS_FILTER_OPTIONS.map((s) => ({
            value: s,
            label: STATUS_LABEL[s],
          })),
        ]}
      />
      {hasFacetFilters ? (
        <button
          type="button"
          className="filter-clear has-icon-tip mods-clear-filters"
          onClick={() => onChange(createDefaultInstallTableFilters())}
          aria-label="Clear filters"
        >
          <ClearFiltersIcon />
          <span className="icon-tip" role="tooltip">
            Clear filters
          </span>
        </button>
      ) : null}
      <span className="mods-count" aria-live="polite">
        {visibleCount} of {totalCount} steps
      </span>
    </div>
  )
}
