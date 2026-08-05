import { useId, useRef, useState, type ReactNode } from 'react'
import {
  FILTER_LADDER_LEVELS,
  LEVEL_LABELS,
  type LadderLevel,
} from '../lib/levels'
import {
  formatBytes,
  type AuthorOption,
  type SizeBounds,
} from '../lib/mods/loadMods'
import {
  createDefaultFilterCriteria,
  isAuthorFilterActive,
  isFilterActive,
  isSizeFilterActive,
  type AuthorFilterMode,
  type FilterCriteria,
} from '../lib/selection/filterDisplayTree'

/** Stable id for chrome hotkey `/` focus jump. */
export const FILTERS_SEARCH_ID = 'filters-search'

interface Props {
  criteria: FilterCriteria
  onChange: (next: FilterCriteria) => void
  /** Kept for default criteria seeding; Tags UI deferred to stations. */
  tagOptions: string[]
  authorOptions: AuthorOption[]
  sizeBounds: SizeBounds | null
  /** Called when Esc blurs search so focus can return to the component tree. */
  onRequestTreeFocus?: () => void
}

type PanelId = 'level' | 'size' | 'author'

const AUTHOR_MODE_OPTIONS: { value: AuthorFilterMode; label: string }[] = [
  { value: 'include', label: 'Include selected' },
  { value: 'exclude', label: 'Exclude selected' },
]

const MORPHEUS_WARNING =
  "This author is known for redirecting his site's domain to unsecure sites. If you use his mods, do so with caution."

function toggleInSet(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function FiltersStrip({
  criteria,
  onChange,
  tagOptions,
  authorOptions,
  sizeBounds,
  onRequestTreeFocus,
}: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null)
  const baseId = useId()
  const searchRef = useRef<HTMLInputElement>(null)

  const authorNames = authorOptions.map((a) => a.name)
  const seed = { authorOptions: authorNames, sizeBounds }
  const active = isFilterActive(criteria, tagOptions, seed)
  const levelActive = criteria.maxLevel !== null
  const sizeActive = isSizeFilterActive(criteria, sizeBounds)
  const authorActive = isAuthorFilterActive(criteria, authorNames)
  const hiddenActive = criteria.showHidden

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

  function wrapPanel(id: string, label: string, body: ReactNode) {
    return (
      <div className="filter-panel-wrap">
        <div className="filter-panel" id={id} role="group" aria-label={label}>
          {body}
        </div>
        <button
          type="button"
          className="filter-panel-hide"
          onClick={() => setOpenPanel(null)}
        >
          Hide
        </button>
      </div>
    )
  }

  let panelBody: ReactNode = null
  if (openPanel === 'level') {
    panelBody = wrapPanel(
      `${baseId}-level`,
      'Level',
      <>
        <label className="filter-option">
          <input
            type="radio"
            name={`${baseId}-ladder`}
            checked={criteria.maxLevel === null}
            onChange={() => selectLadder(null)}
          />
          All levels
        </label>
        {FILTER_LADDER_LEVELS.map((level) => (
          <label key={level} className="filter-option">
            <input
              type="radio"
              name={`${baseId}-ladder`}
              checked={criteria.maxLevel === level}
              onChange={() => selectLadder(level)}
            />
            {LEVEL_LABELS[level]}
          </label>
        ))}
        <label className={`filter-option${criteria.maxLevel ? '' : ' disabled'}`}>
          <input
            type="checkbox"
            checked={criteria.levelExact}
            disabled={!criteria.maxLevel}
            onChange={(e) => patch({ levelExact: e.target.checked })}
          />
          This level only
        </label>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={criteria.includeLowerDifficulty}
            onChange={(e) => patch({ includeLowerDifficulty: e.target.checked })}
          />
          Include {LEVEL_LABELS.lowerDifficulty}
        </label>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={criteria.includeHigherDifficulty}
            onChange={(e) => patch({ includeHigherDifficulty: e.target.checked })}
          />
          Include {LEVEL_LABELS.higherDifficulty}
        </label>
      </>,
    )
  } else if (openPanel === 'size') {
    const min = criteria.sizeMinBytes ?? sizeBounds?.min ?? 0
    const max = criteria.sizeMaxBytes ?? sizeBounds?.max ?? 0
    panelBody = wrapPanel(
      `${baseId}-size`,
      'Size',
      sizeBounds ? (
        <div className="filter-size">
          <div className="filter-size-labels">
            <span>{formatBytes(min)}</span>
            <span>—</span>
            <span>{formatBytes(max)}</span>
          </div>
          <div className="filter-size-slider">
            <input
              type="range"
              className="filter-size-range filter-size-range-min"
              min={sizeBounds.min}
              max={sizeBounds.max}
              value={min}
              aria-label="Minimum size"
              onChange={(e) => setSizeMin(Number(e.target.value))}
            />
            <input
              type="range"
              className="filter-size-range filter-size-range-max"
              min={sizeBounds.min}
              max={sizeBounds.max}
              value={max}
              aria-label="Maximum size"
              onChange={(e) => setSizeMax(Number(e.target.value))}
            />
          </div>
          <div className="filter-size-bounds">
            <span>{formatBytes(sizeBounds.min)}</span>
            <span>{formatBytes(sizeBounds.max)}</span>
          </div>
        </div>
      ) : (
        <p className="filter-panel-empty">No size data in mods.csv.</p>
      ),
    )
  } else if (openPanel === 'author') {
    panelBody = wrapPanel(
      `${baseId}-author`,
      'Author',
      authorOptions.length === 0 ? (
        <p className="filter-panel-empty">No frequent authors in mods.csv.</p>
      ) : (
        <>
          {AUTHOR_MODE_OPTIONS.map((opt) => (
            <label key={opt.value} className="filter-option">
              <input
                type="radio"
                name={`${baseId}-author-mode`}
                checked={criteria.authorMode === opt.value}
                onChange={() => patch({ authorMode: opt.value })}
              />
              {opt.label}
            </label>
          ))}
          <button
            type="button"
            className="filter-inline-action"
            onClick={() => patch({ authors: new Set(authorNames) })}
          >
            Select all
          </button>
          <button
            type="button"
            className="filter-inline-action"
            onClick={() => patch({ authors: new Set() })}
          >
            Clear
          </button>
          {authorOptions.map((opt) => (
            <label key={opt.name} className="filter-option">
              <input
                type="checkbox"
                checked={criteria.authors.has(opt.name)}
                onChange={() =>
                  patch({ authors: toggleInSet(criteria.authors, opt.name) })
                }
              />
              <span className="filter-author-name">
                {opt.name}
                {opt.name === 'Morpheus562' && (
                  <span
                    className="filter-author-warning"
                    title={MORPHEUS_WARNING}
                    aria-label={MORPHEUS_WARNING}
                  >
                    !
                  </span>
                )}
              </span>
              <span className="filter-author-count">({opt.count})</span>
            </label>
          ))}
        </>
      ),
    )
  }

  const sizeChipLabel =
    sizeActive &&
    criteria.sizeMinBytes != null &&
    criteria.sizeMaxBytes != null
      ? `: ${formatBytes(criteria.sizeMinBytes)}–${formatBytes(criteria.sizeMaxBytes)}`
      : ''

  return (
    <div
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
        <input
          ref={searchRef}
          id={FILTERS_SEARCH_ID}
          type="search"
          className="filters-search"
          placeholder="Search in this window..."
          value={criteria.search}
          onChange={(e) => patch({ search: e.target.value })}
          aria-label="Search in this window"
        />

        <button
          type="button"
          className={`filter-chip${levelActive ? ' active' : ''}${openPanel === 'level' ? ' open' : ''}`}
          aria-expanded={openPanel === 'level'}
          aria-controls={`${baseId}-level`}
          onClick={() => togglePanel('level')}
        >
          Level
          {levelActive && criteria.maxLevel
            ? `: ${LEVEL_LABELS[criteria.maxLevel] ?? criteria.maxLevel}`
            : ''}
        </button>

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

        <button
          type="button"
          className={`filter-chip${hiddenActive ? ' active' : ''}`}
          aria-pressed={hiddenActive}
          onClick={() => patch({ showHidden: !criteria.showHidden })}
        >
          Show hidden components
        </button>

        {active && (
          <button type="button" className="filter-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {panelBody}
    </div>
  )
}
