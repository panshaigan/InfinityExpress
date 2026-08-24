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

type FacetId = 'status' | 'category' | 'mod'

interface FacetOptions {
  categories: string[]
  mods: { modId: string; label: string }[]
}

interface Props {
  filters: InstallTableFilters
  onChange: (next: InstallTableFilters) => void
  facets: FacetOptions
  visibleCount: number
  totalCount: number
}

export function InstallFiltersBar({
  filters,
  onChange,
  facets,
  visibleCount,
  totalCount,
}: Props) {
  const [openFacet, setOpenFacet] = useState<FacetId | null>(null)
  const hasFacetFilters =
    filters.statuses.length > 0 ||
    filters.categories.length > 0 ||
    filters.modIds.length > 0 ||
    !!filters.search.trim()

  function facetOpenChange(id: FacetId, open: boolean) {
    setOpenFacet(open ? id : null)
  }

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
        open={openFacet === 'status'}
        onOpenChange={(open) => facetOpenChange('status', open)}
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
        label="Mod"
        value={filters.modIds[0] ?? ''}
        open={openFacet === 'mod'}
        onOpenChange={(open) => facetOpenChange('mod', open)}
        onChange={(next) =>
          onChange({
            ...filters,
            modIds: next ? [next] : [],
          })
        }
        options={[
          { value: '', label: 'All' },
          ...facets.mods.map((m) => ({ value: m.modId, label: m.label })),
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
