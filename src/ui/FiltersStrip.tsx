import { useId, useState, type ReactNode } from 'react'
import {
  FILTER_LADDER_LEVELS,
  LEVEL_LABELS,
  type LadderLevel,
} from '../lib/levels'
import {
  STABILITY_RELEASED,
  createDefaultFilterCriteria,
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

type PanelId = 'level' | 'stability' | 'tags' | 'hidden' | 'required'

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
}: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null)
  const baseId = useId()

  const defaults = createDefaultFilterCriteria(tagOptions)
  const active = isFilterActive(criteria, tagOptions)
  const levelActive = criteria.maxLevel !== null
  const stabilityActive = !setsEqual(criteria.stability, defaults.stability)
  const tagsActive =
    criteria.tagsOnlyChecked || !setsEqual(criteria.tags, defaults.tags)
  const hiddenActive = criteria.hiddenMode !== 'hide'
  const requiredActive = criteria.requiredMode !== defaults.requiredMode

  function patch(partial: Partial<FilterCriteria>) {
    onChange({ ...criteria, ...partial })
  }

  function togglePanel(id: PanelId) {
    setOpenPanel((prev) => (prev === id ? null : id))
  }

  function clearFilters() {
    onChange(createDefaultFilterCriteria(tagOptions))
  }

  function selectLadder(level: LadderLevel | null) {
    patch({
      maxLevel: level,
      levelExact: level ? criteria.levelExact : false,
    })
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
