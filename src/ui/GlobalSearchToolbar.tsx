import { useEffect, useRef, type ChangeEvent } from 'react'

interface Props {
  resultCount: number
  checkableCount: number
  listState: 'checked' | 'unchecked' | 'indeterminate'
  onToggleAll: (wantSelected: boolean) => void
  searchQuery?: string
  /** True while the all-stations result set is being built. */
  loading?: boolean
}

/** Select-all / clear for the current global search result set. */
export function GlobalSearchToolbar({
  resultCount,
  checkableCount,
  listState,
  onToggleAll,
  searchQuery = '',
  loading = false,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const empty = loading || checkableCount === 0
  const checked = listState === 'checked'
  const q = searchQuery.trim()

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = listState === 'indeterminate'
    }
  }, [listState])

  function handleSelectAllChange(e: ChangeEvent<HTMLInputElement>) {
    onToggleAll(e.target.checked)
  }

  let countLabel: string
  if (loading) {
    countLabel = 'Searching…'
  } else if (resultCount === 0) {
    countLabel = q ? 'No matches' : 'Ready to search'
  } else {
    countLabel = `${resultCount} component${resultCount === 1 ? '' : 's'}`
    if (checkableCount < resultCount) {
      countLabel += ` · ${checkableCount} selectable`
    }
  }

  return (
    <div className="station-list-toolbar">
      <label className={`station-select-all${empty ? ' disabled' : ''}`}>
        <input
          ref={selectAllRef}
          type="checkbox"
          checked={checked}
          disabled={empty}
          aria-label="Select all checkable search results"
          onChange={handleSelectAllChange}
        />
        <span>Select all</span>
      </label>
      <span className="global-search-count" aria-live="polite">
        {countLabel}
      </span>
    </div>
  )
}
