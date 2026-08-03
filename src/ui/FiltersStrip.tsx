import { useId, useState, type ReactNode } from 'react'
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
  STABILITY_RELEASED,
  createDefaultFilterCriteria,
  isAuthorFilterActive,
  isFilterActive,
  isSizeFilterActive,
  type AuthorFilterMode,
  type FilterCriteria,
  type TriFilterMode,
} from '../lib/selection/filterDisplayTree'

interface Props {
  criteria: FilterCriteria
  onChange: (next: FilterCriteria) => void
  tagOptions: string[]
  stabilityOptions: string[]
  authorOptions: AuthorOption[]
  sizeBounds: SizeBounds | null
}

type PanelId = 'level' | 'stability' | 'tags' | 'size' | 'author' | 'hidden' | 'required'

const TRI_OPTIONS: { value: TriFilterMode; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
  { value: 'only', label: 'Only' },
]

const AUTHOR_MODE_OPTIONS: { value: AuthorFilterMode; label: string }[] = [
  { value: 'include', label: 'Include selected' },
  { value: 'exclude', label: 'Exclude selected' },
]

function toggleInSet(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) {
    if (!b.has(v)) return false
  }
  return true
}

export function FiltersStrip({
  criteria,
  onChange,
  tagOptions,
  stabilityOptions,
  authorOptions,
  sizeBounds,
}: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null)
  const baseId = useId()

  const authorNames = authorOptions.map((a) => a.name)
  const seed = { authorOptions: authorNames, sizeBounds }
  const defaults = createDefaultFilterCriteria(tagOptions, seed)
  const active = isFilterActive(criteria, tagOptions, seed)
  const levelActive = criteria.maxLevel !== null
  const stabilityActive = !setsEqual(criteria.stability, defaults.stability)
  const tagsActive =
    criteria.tagsOnlyChecked || !setsEqual(criteria.tags, defaults.tags)
  const sizeActive = isSizeFilterActive(criteria, sizeBounds)
  const authorActive = isAuthorFilterActive(criteria, authorNames)
  const hiddenActive = criteria.hiddenMode !== 'hide'
  const requiredActive = criteria.requiredMode !== defaults.requiredMode

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
            checked={criteria.includeDifficulty}
            onChange={(e) => patch({ includeDifficulty: e.target.checked })}
          />
          Include {LEVEL_LABELS.difficulty}
        </label>
      </>,
    )
  } else if (openPanel === 'stability') {
    panelBody = wrapPanel(
      `${baseId}-stability`,
      'Stability',
      <>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={criteria.stability.has(STABILITY_RELEASED)}
            onChange={() =>
              patch({ stability: toggleInSet(criteria.stability, STABILITY_RELEASED) })
            }
          />
          Released
        </label>
        {stabilityOptions.map((s) => (
          <label key={s} className="filter-option">
            <input
              type="checkbox"
              checked={criteria.stability.has(s)}
              onChange={() => patch({ stability: toggleInSet(criteria.stability, s) })}
            />
            {s}
          </label>
        ))}
      </>,
    )
  } else if (openPanel === 'tags') {
    panelBody = wrapPanel(
      `${baseId}-tags`,
      'Tags',
      <>
        {tagOptions.length === 0 ? (
          <p className="filter-panel-empty">No tags in this sequence.</p>
        ) : (
          <>
            {tagOptions.map((tag) => (
              <label key={tag} className="filter-option">
                <input
                  type="checkbox"
                  checked={criteria.tags.has(tag)}
                  onChange={() => patch({ tags: toggleInSet(criteria.tags, tag) })}
                />
                {tag}
              </label>
            ))}
            <label className="filter-option">
              <input
                type="checkbox"
                checked={criteria.tagsOnlyChecked}
                onChange={(e) => patch({ tagsOnlyChecked: e.target.checked })}
              />
              Only checked tags
            </label>
          </>
        )}
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
              {opt.name} ({opt.count})
            </label>
          ))}
        </>
      ),
    )
  } else if (openPanel === 'hidden') {
    panelBody = wrapPanel(
      `${baseId}-hidden`,
      'Hidden',
      TRI_OPTIONS.map((opt) => (
        <label key={opt.value} className="filter-option">
          <input
            type="radio"
            name={`${baseId}-hidden`}
            checked={criteria.hiddenMode === opt.value}
            onChange={() => patch({ hiddenMode: opt.value })}
          />
          {opt.label}
        </label>
      )),
    )
  } else if (openPanel === 'required') {
    panelBody = wrapPanel(
      `${baseId}-required`,
      'Required',
      TRI_OPTIONS.map((opt) => (
        <label key={opt.value} className="filter-option">
          <input
            type="radio"
            name={`${baseId}-required`}
            checked={criteria.requiredMode === opt.value}
            onChange={() => patch({ requiredMode: opt.value })}
          />
          {opt.label}
        </label>
      )),
    )
  }

  const sizeChipLabel =
    sizeActive &&
    criteria.sizeMinBytes != null &&
    criteria.sizeMaxBytes != null
      ? `: ${formatBytes(criteria.sizeMinBytes)}–${formatBytes(criteria.sizeMaxBytes)}`
      : ''

  return (
    <div className="filters-strip" aria-label="Filters">
      <div className="filters-row">
        <span className="filters-label">Filters</span>
        <input
          type="search"
          className="filters-search"
          placeholder="Search…"
          value={criteria.search}
          onChange={(e) => patch({ search: e.target.value })}
          aria-label="Search components"
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
          className={`filter-chip${stabilityActive ? ' active' : ''}${openPanel === 'stability' ? ' open' : ''}`}
          aria-expanded={openPanel === 'stability'}
          aria-controls={`${baseId}-stability`}
          onClick={() => togglePanel('stability')}
        >
          Stability{stabilityActive ? ` (${criteria.stability.size})` : ''}
        </button>

        <button
          type="button"
          className={`filter-chip${tagsActive ? ' active' : ''}${openPanel === 'tags' ? ' open' : ''}`}
          aria-expanded={openPanel === 'tags'}
          aria-controls={`${baseId}-tags`}
          onClick={() => togglePanel('tags')}
          disabled={tagOptions.length === 0}
        >
          Tags{tagsActive ? ` (${criteria.tags.size})` : ''}
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
          className={`filter-chip${hiddenActive ? ' active' : ''}${openPanel === 'hidden' ? ' open' : ''}`}
          aria-expanded={openPanel === 'hidden'}
          aria-controls={`${baseId}-hidden`}
          onClick={() => togglePanel('hidden')}
        >
          Hidden: {criteria.hiddenMode}
        </button>

        <button
          type="button"
          className={`filter-chip${requiredActive ? ' active' : ''}${openPanel === 'required' ? ' open' : ''}`}
          aria-expanded={openPanel === 'required'}
          aria-controls={`${baseId}-required`}
          onClick={() => togglePanel('required')}
        >
          Required: {criteria.requiredMode}
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
