import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { type AuthorOption, type SizeBounds } from '../lib/mods/loadMods'
import {
  createDefaultFilterCriteria,
  cycleUncheckedFilter,
  isAuthorFilterActive,
  isFilterActive,
  uncheckedFilterLabel,
  type FilterCriteria,
} from '../lib/selection/filterDisplayTree'
import { AuthorFilterPanel } from './filters/AuthorFilterPanel'
import { IconTip } from './IconTip'

/** Stable id for chrome hotkey `/` focus jump. */
export const FILTERS_SEARCH_ID = 'filters-search'

function AuthorsIcon() {
  return (
    <svg
      className="filter-chip-icon-svg"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M5.5 7.25A2.5 2.5 0 1 0 5.5 2.25a2.5 2.5 0 0 0 0 5ZM1.25 12.6c0-1.9 1.9-3.1 4.25-3.1s4.25 1.2 4.25 3.1v1.15H1.25V12.6ZM11.25 7A2 2 0 1 0 11.25 3a2 2 0 0 0 0 4ZM10.15 9.62c.35-.08.72-.12 1.1-.12 1.9 0 3.5.95 3.5 2.6v1.65h-2.4v-1.4c0-.85-.4-1.55-1.1-2.05a4.3 4.3 0 0 0-1.1-.68Z"
      />
    </svg>
  )
}

function ClearFiltersIcon() {
  return (
    <svg
      className="filter-clear-icon"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M3.5 3.5 8 8l4.5-4.5.9.9L8.9 8.9l4.5 4.5-.9.9L8 9.8l-4.5 4.5-.9-.9 4.5-4.5L2.6 4.4z"
      />
    </svg>
  )
}

interface Props {
  criteria: FilterCriteria
  onChange: (next: FilterCriteria) => void
  /** Discovered tag tokens; used for default criteria seed (no UI chip). */
  tagOptions: string[]
  authorOptions: AuthorOption[]
  /** Catalog size bounds; used for default criteria seed (no UI chip). */
  sizeBounds: SizeBounds | null
  /** Called when Esc blurs search so focus can return to the component tree. */
  onRequestTreeFocus?: () => void
  /** Override search field placeholder / aria-label (e.g. global search). */
  searchPlaceholder?: string
  /** In-window vs all-stations search. */
  searchScope?: 'section' | 'all'
  onSearchScopeChange?: (scope: 'section' | 'all') => void
}

type PanelId = 'author'

function FilterChipWrap({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [alignEnd, setAlignEnd] = useState(false)

  useLayoutEffect(() => {
    if (!open) return
    const el = wrapRef.current
    if (!el) return

    function measure() {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const popoverMin = 360
      const spaceRight = window.innerWidth - rect.left
      setAlignEnd(spaceRight < popoverMin && rect.right > popoverMin)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open])

  return (
    <div
      ref={wrapRef}
      className={`filter-chip-wrap${alignEnd ? ' align-end' : ''}`}
    >
      {children}
    </div>
  )
}

export function FiltersStrip({
  criteria,
  onChange,
  tagOptions,
  authorOptions,
  sizeBounds,
  onRequestTreeFocus,
  searchPlaceholder = 'Search in this window...',
  searchScope = 'section',
  onSearchScopeChange,
}: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null)
  const baseId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const authorNames = authorOptions.map((a) => a.name)
  const seed = { authorOptions: authorNames, sizeBounds }
  const active = isFilterActive(criteria, tagOptions, seed)
  const authorActive = isAuthorFilterActive(criteria, authorNames)
  const authorTip = authorActive
    ? `Authors ${criteria.authorMode === 'exclude' ? 'excl. ' : ''}(${criteria.authors.size})`
    : 'Authors'
  const hiddenActive = criteria.showHidden
  const uncheckedActive = criteria.uncheckedFilter !== 'off'

  useEffect(() => {
    if (!openPanel) return
    function onPointerDown(e: PointerEvent) {
      if (!stripRef.current?.contains(e.target as Node)) {
        setOpenPanel(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openPanel])

  function patch(partial: Partial<FilterCriteria>) {
    onChange({ ...criteria, ...partial })
  }

  function togglePanel(id: PanelId) {
    setOpenPanel((prev) => (prev === id ? null : id))
  }

  function clearFilters() {
    onChange(createDefaultFilterCriteria(tagOptions, seed))
  }

  function renderPopover(id: PanelId, label: string, body: ReactNode) {
    if (openPanel !== id) return null
    const panelId = `${baseId}-${id}`
    return (
      <div className="filter-popover" id={panelId} role="group" aria-label={label}>
        <div className="filter-panel">{body}</div>
      </div>
    )
  }

  return (
    <div
      ref={stripRef}
      className="filters-strip"
      aria-label="Filters"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        if (openPanel) {
          e.preventDefault()
          setOpenPanel(null)
          return
        }
        if (document.activeElement === searchRef.current) {
          e.preventDefault()
          searchRef.current?.blur()
          onRequestTreeFocus?.()
        }
      }}
    >
      <div className="filters-row">
        <button
          type="button"
          className={`filters-scope has-icon-tip${searchScope === 'all' ? ' all' : ''}`}
          aria-pressed={searchScope === 'all'}
          aria-label={
            searchScope === 'all'
              ? 'Search scope: all sections. Click for this section.'
              : 'Search scope: this section. Click for all sections.'
          }
          onClick={() =>
            onSearchScopeChange?.(searchScope === 'all' ? 'section' : 'all')
          }
        >
          {searchScope === 'all' ? 'All sections' : 'This section'}
          <IconTip>
            {searchScope === 'all'
              ? 'Matches components across every station'
              : 'Matches only what is listed in this window'}
          </IconTip>
        </button>
        <input
          ref={searchRef}
          id={FILTERS_SEARCH_ID}
          type="search"
          className="filters-search"
          placeholder={searchPlaceholder}
          value={criteria.search}
          autoComplete="off"
          onChange={(e) => patch({ search: e.target.value })}
          aria-label={searchPlaceholder}
        />

        <FilterChipWrap open={openPanel === 'author'}>
          <span className="has-icon-tip">
            <button
              type="button"
              className={`filter-chip filter-chip-icon${authorActive ? ' active' : ''}${openPanel === 'author' ? ' open' : ''}`}
              aria-expanded={openPanel === 'author'}
              aria-controls={`${baseId}-author`}
              aria-label={authorTip}
              onClick={() => togglePanel('author')}
              disabled={authorOptions.length === 0}
            >
              <AuthorsIcon />
            </button>
            {openPanel !== 'author' ? <IconTip>{authorTip}</IconTip> : null}
          </span>
          {renderPopover(
            'author',
            'Authors',
            <AuthorFilterPanel
              baseId={baseId}
              criteria={criteria}
              authorOptions={authorOptions}
              authorNames={authorNames}
              onPatch={patch}
            />,
          )}
        </FilterChipWrap>

        <button
          type="button"
          className={`filter-chip${hiddenActive ? ' active' : ''}`}
          aria-pressed={hiddenActive}
          onClick={() => patch({ showHidden: !criteria.showHidden })}
        >
          Hidden
        </button>

        <button
          type="button"
          className={`filter-chip${uncheckedActive ? ' active' : ''}`}
          aria-pressed={uncheckedActive}
          onClick={() =>
            patch({ uncheckedFilter: cycleUncheckedFilter(criteria.uncheckedFilter) })
          }
        >
          {uncheckedFilterLabel(criteria.uncheckedFilter)}
        </button>

        {active && (
          <button
            type="button"
            className="filter-clear has-icon-tip"
            onClick={clearFilters}
            aria-label="Clear filters"
          >
            <ClearFiltersIcon />
            <IconTip>Clear filters</IconTip>
          </button>
        )}
      </div>
    </div>
  )
}
