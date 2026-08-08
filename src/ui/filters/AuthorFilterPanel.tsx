import type { AuthorOption } from '../../lib/mods/loadMods'
import {
  type AuthorFilterMode,
  type FilterCriteria,
} from '../../lib/selection/filterDisplayTree'
import { toggleInSet } from './filterPanelShared'

const AUTHOR_MODE_OPTIONS: { value: AuthorFilterMode; label: string }[] = [
  { value: 'include', label: 'Include' },
  { value: 'exclude', label: 'Exclude' },
]

const MORPHEUS_WARNING =
  "This author is known for redirecting his site's domain to unsecure sites. If you use his mods, do so with caution."

interface Props {
  baseId: string
  criteria: FilterCriteria
  authorOptions: AuthorOption[]
  authorNames: string[]
  onPatch: (partial: Partial<FilterCriteria>) => void
}

export function AuthorFilterPanel({
  baseId,
  criteria,
  authorOptions,
  authorNames,
  onPatch,
}: Props) {
  if (authorOptions.length === 0) {
    return (
      <p className="filter-panel-empty">No frequent authors in mods.csv.</p>
    )
  }

  return (
    <div className="filter-panel-stack">
      <div className="filter-panel-toolbar">
        <div
          className="filter-mode-toggle"
          role="group"
          aria-label="Author filter mode"
        >
          {AUTHOR_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`filter-mode-option${
                criteria.authorMode === opt.value ? ' active' : ''
              }`}
            >
              <input
                type="radio"
                name={`${baseId}-author-mode`}
                checked={criteria.authorMode === opt.value}
                onChange={() => onPatch({ authorMode: opt.value })}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="filter-panel-actions">
          <button
            type="button"
            className="filter-inline-action"
            onClick={() => onPatch({ authors: new Set(authorNames) })}
          >
            Select all
          </button>
          <button
            type="button"
            className="filter-inline-action"
            onClick={() => onPatch({ authors: new Set() })}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="filter-panel-list" role="group" aria-label="Authors">
        {authorOptions.map((opt) => (
          <label key={opt.name} className="filter-option">
            <input
              type="checkbox"
              checked={criteria.authors.has(opt.name)}
              onChange={() =>
                onPatch({ authors: toggleInSet(criteria.authors, opt.name) })
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
      </div>
    </div>
  )
}
