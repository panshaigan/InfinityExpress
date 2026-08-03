import { useEffect, useId, useRef, useState } from 'react'
import {
  FILTER_LADDER_LEVELS,
  LEVEL_LABELS,
  type LadderLevel,
} from '../lib/levels'
import {
  STABILITY_RELEASED,
  isFilterActive,
  type FilterCriteria,
  type TriFilterMode,
} from '../lib/selection/filterDisplayTree'

interface Props {
  criteria: FilterCriteria
  onChange: (next: FilterCriteria) => void
  tagOptions: string[]
  stabilityOptions: string[]
}

type PanelId = 'level' | 'stability' | 'tags' | 'hidden' | 'required' | null

const TRI_OPTIONS: { value: TriFilterMode; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
  { value: 'only', label: 'Only' },
]

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
  stabilityOptions,
}: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const baseId = useId()

  useEffect(() => {
    if (!openPanel) return
    function onDocDown(e: MouseEvent) {
      if (!stripRef.current?.contains(e.target as Node)) {
        setOpenPanel(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenPanel(null)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openPanel])

  const active = isFilterActive(criteria)
  const levelActive = criteria.maxLevel !== null
  const stabilityActive = criteria.stability.size > 0
  const tagsActive = criteria.tags.size > 0
  const hiddenActive = criteria.hiddenMode !== 'hide'
  const requiredActive = criteria.requiredMode !== 'show'

  function patch(partial: Partial<FilterCriteria>) {
    onChange({ ...criteria, ...partial })
  }

  function togglePanel(id: PanelId) {
    setOpenPanel((prev) => (prev === id ? null : id))
  }

  function clearFilters() {
    onChange({
      search: '',
      maxLevel: null,
      levelExact: false,
      includeDifficulty: false,
      hiddenMode: 'hide',
      requiredMode: 'show',
      stability: new Set(),
      tags: new Set(),
    })
    setOpenPanel(null)
  }

  function selectLadder(level: LadderLevel | null) {
    patch({
      maxLevel: level,
      levelExact: level ? criteria.levelExact : false,
      includeDifficulty: level ? criteria.includeDifficulty : false,
    })
  }

  return (
    <div className="filters-strip" aria-label="Filters" ref={stripRef}>
      <span className="filters-label">Filters</span>
      <input
        type="search"
        className="filters-search"
        placeholder="Search…"
        value={criteria.search}
        onChange={(e) => patch({ search: e.target.value })}
        aria-label="Search components"
      />

      <div className="filter-menu">
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
        {openPanel === 'level' && (
          <div className="filter-panel" id={`${baseId}-level`} role="group" aria-label="Level">
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
            <label className={`filter-option${criteria.maxLevel ? '' : ' disabled'}`}>
              <input
                type="checkbox"
                checked={criteria.includeDifficulty}
                disabled={!criteria.maxLevel}
                onChange={(e) => patch({ includeDifficulty: e.target.checked })}
              />
              Include {LEVEL_LABELS.difficulty}
            </label>
          </div>
        )}
      </div>

      <div className="filter-menu">
        <button
          type="button"
          className={`filter-chip${stabilityActive ? ' active' : ''}${openPanel === 'stability' ? ' open' : ''}`}
          aria-expanded={openPanel === 'stability'}
          aria-controls={`${baseId}-stability`}
          onClick={() => togglePanel('stability')}
        >
          Stability{stabilityActive ? ` (${criteria.stability.size})` : ''}
        </button>
        {openPanel === 'stability' && (
          <div
            className="filter-panel"
            id={`${baseId}-stability`}
            role="group"
            aria-label="Stability"
          >
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
          </div>
        )}
      </div>

      <div className="filter-menu">
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
        {openPanel === 'tags' && (
          <div className="filter-panel" id={`${baseId}-tags`} role="group" aria-label="Tags">
            {tagOptions.length === 0 ? (
              <p className="filter-panel-empty">No tags in this sequence.</p>
            ) : (
              tagOptions.map((tag) => (
                <label key={tag} className="filter-option">
                  <input
                    type="checkbox"
                    checked={criteria.tags.has(tag)}
                    onChange={() => patch({ tags: toggleInSet(criteria.tags, tag) })}
                  />
                  {tag}
                </label>
              ))
            )}
          </div>
        )}
      </div>

      <div className="filter-menu">
        <button
          type="button"
          className={`filter-chip${hiddenActive ? ' active' : ''}${openPanel === 'hidden' ? ' open' : ''}`}
          aria-expanded={openPanel === 'hidden'}
          aria-controls={`${baseId}-hidden`}
          onClick={() => togglePanel('hidden')}
        >
          Hidden: {criteria.hiddenMode}
        </button>
        {openPanel === 'hidden' && (
          <div className="filter-panel" id={`${baseId}-hidden`} role="group" aria-label="Hidden">
            {TRI_OPTIONS.map((opt) => (
              <label key={opt.value} className="filter-option">
                <input
                  type="radio"
                  name={`${baseId}-hidden`}
                  checked={criteria.hiddenMode === opt.value}
                  onChange={() => patch({ hiddenMode: opt.value })}
                />
                {opt.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="filter-menu">
        <button
          type="button"
          className={`filter-chip${requiredActive ? ' active' : ''}${openPanel === 'required' ? ' open' : ''}`}
          aria-expanded={openPanel === 'required'}
          aria-controls={`${baseId}-required`}
          onClick={() => togglePanel('required')}
        >
          Required: {criteria.requiredMode}
        </button>
        {openPanel === 'required' && (
          <div
            className="filter-panel"
            id={`${baseId}-required`}
            role="group"
            aria-label="Required"
          >
            {TRI_OPTIONS.map((opt) => (
              <label key={opt.value} className="filter-option">
                <input
                  type="radio"
                  name={`${baseId}-required`}
                  checked={criteria.requiredMode === opt.value}
                  onChange={() => patch({ requiredMode: opt.value })}
                />
                {opt.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {active && (
        <button type="button" className="filter-clear" onClick={clearFilters}>
          Clear filters
        </button>
      )}
    </div>
  )
}
