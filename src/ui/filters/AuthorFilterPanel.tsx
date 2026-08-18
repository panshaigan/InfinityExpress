import { useEffect, useRef, type ChangeEvent } from 'react'
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
  const selectAllRef = useRef<HTMLInputElement>(null)
  const allSelected =
    authorNames.length > 0 &&
    authorNames.every((name) => criteria.authors.has(name))
  const noneSelected = criteria.authors.size === 0
  const listState = allSelected
    ? 'checked'
    : noneSelected
      ? 'unchecked'
      : 'indeterminate'

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = listState === 'indeterminate'
    }
  }, [listState])

  if (authorOptions.length === 0) {
    return (
      <p className="filter-panel-empty">No frequent authors in mods.csv.</p>
    )
  }

  function handleSelectAllChange(e: ChangeEvent<HTMLInputElement>) {
    onPatch({
      authors: e.target.checked ? new Set(authorNames) : new Set(),
    })
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
        <label className="station-select-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            aria-label="Select all authors"
            onChange={handleSelectAllChange}
          />
          <span>Select all</span>
        </label>
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
            <span className="filter-author-name">{opt.name}</span>
            <span className="filter-author-count">({opt.count})</span>
          </label>
        ))}
      </div>
    </div>
  )
}
