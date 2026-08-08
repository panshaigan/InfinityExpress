import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { LEVEL_LABELS, type LadderLevel } from '../lib/levels'
import { formatBytes, type AuthorOption, type SizeBounds } from '../lib/mods/loadMods'
import {
  createDefaultFilterCriteria,
  cycleUncheckedFilter,
  isAuthorFilterActive,
  isFilterActive,
  isSizeFilterActive,
  isTagsFilterActive,
  uncheckedFilterLabel,
  type FilterCriteria,
} from '../lib/selection/filterDisplayTree'
import { LevelFilterPanel } from './filters/LevelFilterPanel'
import { SizeFilterPanel } from './filters/SizeFilterPanel'
import { AuthorFilterPanel } from './filters/AuthorFilterPanel'
import { TagsFilterPanel } from './filters/TagsFilterPanel'

/** Stable id for chrome hotkey `/` focus jump. */
export const FILTERS_SEARCH_ID = 'filters-search'

interface Props {
  criteria: FilterCriteria
  onChange: (next: FilterCriteria) => void
  /** Discovered tag tokens; Defaults / Clear select all. */
  tagOptions: string[]
  authorOptions: AuthorOption[]
  sizeBounds: SizeBounds | null
  /** Called when Esc blurs search so focus can return to the component tree. */
  onRequestTreeFocus?: () => void
  /** Override search field placeholder / aria-label (e.g. global search). */
  searchPlaceholder?: string
  /** Clarifies in-window vs all-stations search. */
  searchScope?: 'station' | 'global'
}

type PanelId = 'level' | 'size' | 'author' | 'tags'

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
  searchScope = 'station',
}: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null)
  const baseId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const authorNames = authorOptions.map((a) => a.name)
  const seed = { authorOptions: authorNames, sizeBounds }
  const active = isFilterActive(criteria, tagOptions, seed)
  const levelActive = criteria.maxLevel !== null
  const sizeActive = isSizeFilterActive(criteria, sizeBounds)
  const authorActive = isAuthorFilterActive(criteria, authorNames)
  const tagsActive = isTagsFilterActive(criteria, tagOptions)
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

  function selectLadder(level: LadderLevel | null) {
    patch({
      maxLevel: level,
      levelExact: level ? criteria.levelExact : false,
    })
  }

  function setSizeMin(value: number) {
    if (!sizeBounds) return
    const max = criteria.sizeMaxBytes ?? sizeBounds.max
    patch({ sizeMinBytes: Math.min(value, max) })
  }

  function setSizeMax(value: number) {
    if (!sizeBounds) return
    const min = criteria.sizeMinBytes ?? sizeBounds.min
    patch({ sizeMaxBytes: Math.max(value, min) })
  }

  function renderPopover(id: PanelId, label: string, body: ReactNode) {
    if (openPanel !== id) return null
    const panelId = `${baseId}-${id}`
    return (
      <div className="filter-popover" id={panelId} role="group" aria-label={label}>
        <div className="filter-panel">{body}</div>
        <button
          type="button"
          className="filter-panel-hide"
          onClick={() => setOpenPanel(null)}
        >
          Close
        </button>
      </div>
    )
  }

  const sizeChipLabel =
    sizeActive &&
    criteria.sizeMinBytes != null &&
    criteria.sizeMaxBytes != null
      ? `: ${formatBytes(criteria.sizeMinBytes)}–${formatBytes(criteria.sizeMaxBytes)}`
      : ''

  const min = criteria.sizeMinBytes ?? sizeBounds?.min ?? 0
  const max = criteria.sizeMaxBytes ?? sizeBounds?.max ?? 0

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
        <span className="filters-label">Filters</span>
        <span
          className={`filters-scope${searchScope === 'global' ? ' global' : ''}`}
          title={
            searchScope === 'global'
              ? 'Matches components across every station'
              : 'Matches only what is listed in this window'
          }
        >
          {searchScope === 'global' ? 'All stops' : 'This stop'}
        </span>
        <input
          ref={searchRef}
          id={FILTERS_SEARCH_ID}
          type="search"
          className="filters-search"
          placeholder={searchPlaceholder}
          value={criteria.search}
          onChange={(e) => patch({ search: e.target.value })}
          aria-label={searchPlaceholder}
        />

        <FilterChipWrap open={openPanel === 'level'}>
          <button
            type="button"
            className={`filter-chip${levelActive ? ' active' : ''}${openPanel === 'level' ? ' open' : ''}`}
            aria-expanded={openPanel === 'level'}
            aria-controls={`${baseId}-level`}
            onClick={() => togglePanel('level')}
          >
            Show levels
            {levelActive && criteria.maxLevel
              ? `: ${LEVEL_LABELS[criteria.maxLevel] ?? criteria.maxLevel}`
              : ''}
          </button>
          {renderPopover(
            'level',
            'Show levels',
            <LevelFilterPanel
              baseId={baseId}
              criteria={criteria}
              onSelectLadder={selectLadder}
              onPatch={patch}
            />,
          )}
        </FilterChipWrap>

        <FilterChipWrap open={openPanel === 'size'}>
          <button
            type="button"
            className={`filter-chip${sizeActive ? ' active' : ''}${openPanel === 'size' ? ' open' : ''}`}
            aria-expanded={openPanel === 'size'}
            aria-controls={`${baseId}-size`}
            onClick={() => togglePanel('size')}
            disabled={!sizeBounds}
          >
            Size{sizeChipLabel}
          </button>
          {renderPopover(
            'size',
            'Size',
            <SizeFilterPanel
              sizeBounds={sizeBounds}
              min={min}
              max={max}
              onSetMin={setSizeMin}
              onSetMax={setSizeMax}
            />,
          )}
        </FilterChipWrap>

        <FilterChipWrap open={openPanel === 'author'}>
          <button
            type="button"
            className={`filter-chip${authorActive ? ' active' : ''}${openPanel === 'author' ? ' open' : ''}`}
            aria-expanded={openPanel === 'author'}
            aria-controls={`${baseId}-author`}
            onClick={() => togglePanel('author')}
            disabled={authorOptions.length === 0}
          >
            Author
            {authorActive
              ? ` ${criteria.authorMode === 'exclude' ? 'excl.' : ''}(${criteria.authors.size})`
              : ''}
          </button>
          {renderPopover(
            'author',
            'Author',
            <AuthorFilterPanel
              baseId={baseId}
              criteria={criteria}
              authorOptions={authorOptions}
              authorNames={authorNames}
              onPatch={patch}
            />,
          )}
        </FilterChipWrap>

        <FilterChipWrap open={openPanel === 'tags'}>
          <button
            type="button"
            className={`filter-chip${tagsActive ? ' active' : ''}${openPanel === 'tags' ? ' open' : ''}`}
            aria-expanded={openPanel === 'tags'}
            aria-controls={`${baseId}-tags`}
            onClick={() => togglePanel('tags')}
            disabled={tagOptions.length === 0}
          >
            Tags
            {tagsActive ? ` (${criteria.tags.size})` : ''}
          </button>
          {renderPopover(
            'tags',
            'Tags',
            <TagsFilterPanel
              criteria={criteria}
              tagOptions={tagOptions}
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
          Show hidden
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
          <button type="button" className="filter-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
