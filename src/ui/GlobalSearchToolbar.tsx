import { useEffect, useRef, type ChangeEvent } from 'react'

interface Props {
  resultCount: number
  checkableCount: number
  listState: 'checked' | 'unchecked' | 'indeterminate'
  onToggleAll: (wantSelected: boolean) => void
}

/** Select-all / clear for the current global search result set. */
export function GlobalSearchToolbar({
  resultCount,
  checkableCount,
  listState,
  onToggleAll,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const empty = checkableCount === 0
  const checked = listState === 'checked'

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = listState === 'indeterminate'
    }
  }, [listState])

  function handleSelectAllChange(e: ChangeEvent<HTMLInputElement>) {
    onToggleAll(e.target.checked)
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
        {resultCount === 0
          ? 'No matches'
          : `${resultCount} component${resultCount === 1 ? '' : 's'}`}
        {checkableCount < resultCount && resultCount > 0
          ? ` · ${checkableCount} selectable`
          : ''}
      </span>
    </div>
  )
}
