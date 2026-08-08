import type { FilterCriteria } from '../../lib/selection/filterDisplayTree'
import { toggleInSet } from './filterPanelShared'

interface Props {
  criteria: FilterCriteria
  tagOptions: string[]
  onPatch: (partial: Partial<FilterCriteria>) => void
}

export function TagsFilterPanel({ criteria, tagOptions, onPatch }: Props) {
  if (tagOptions.length === 0) {
    return (
      <p className="filter-panel-empty">No tags in this install sequence.</p>
    )
  }

  return (
    <>
      <label className="filter-option">
        <input
          type="checkbox"
          checked={criteria.tagsOnlyChecked}
          onChange={(e) => onPatch({ tagsOnlyChecked: e.target.checked })}
        />
        Only tagged components
      </label>
      <button
        type="button"
        className="filter-inline-action"
        onClick={() => onPatch({ tags: new Set(tagOptions) })}
      >
        Select all
      </button>
      <button
        type="button"
        className="filter-inline-action"
        onClick={() => onPatch({ tags: new Set() })}
      >
        Clear
      </button>
      {tagOptions.map((tag) => (
        <label key={tag} className="filter-option">
          <input
            type="checkbox"
            checked={criteria.tags.has(tag)}
            onChange={() => onPatch({ tags: toggleInSet(criteria.tags, tag) })}
          />
          {tag}
        </label>
      ))}
    </>
  )
}
