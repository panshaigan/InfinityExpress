import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  displayModName,
  diskStatusLabel,
  formatModSize,
  primaryAuthorLabel,
  type ModsSortDir,
  type ModsSortKey,
} from '../../lib/mods/modsTable'
import { effectiveModFields, type WorkingMod } from '../../lib/mods/loadMods'
import { isHttpUrl } from '../../lib/url'

export const MODS_TABLE_ID = 'mods-table'

interface Props {
  rows: WorkingMod[]
  selected: ReadonlySet<string>
  focusedCodename: string | null
  selectionLocked: boolean
  sortKey: ModsSortKey
  sortDir: ModsSortDir
  onSort: (key: ModsSortKey) => void
  onToggle: (codename: string, want: boolean) => void
  onToggleAllVisible: (want: boolean) => void
  onFocusRow: (codename: string) => void
}

const COLUMNS: { key: ModsSortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Name', className: 'mods-col-name' },
  { key: 'category', label: 'Category', className: 'mods-col-category' },
  { key: 'url', label: 'Url', className: 'mods-col-url' },
  { key: 'game', label: 'Game', className: 'mods-col-game' },
  { key: 'release', label: 'Release', className: 'mods-col-release' },
  { key: 'version', label: 'Version', className: 'mods-col-version' },
  { key: 'size', label: 'Size', className: 'mods-col-size' },
  { key: 'author', label: 'Author', className: 'mods-col-author' },
  { key: 'status', label: 'Status', className: 'mods-col-status' },
]

function statusClass(status: WorkingMod['diskStatus']): string {
  return `mods-status mods-status-${status}`
}

export function ModsTable({
  rows,
  selected,
  focusedCodename,
  selectionLocked,
  sortKey,
  sortDir,
  onSort,
  onToggle,
  onToggleAllVisible,
  onFocusRow,
}: Props) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.codename))
  const someSelected =
    !allSelected && rows.some((r) => selected.has(r.codename))

  const focusIndex = useCallback(
    (index: number) => {
      const row = rows[index]
      if (!row) return
      onFocusRow(row.codename)
      requestAnimationFrame(() => {
        rowRefs.current.get(row.codename)?.focus()
      })
    },
    [onFocusRow, rows],
  )

  useEffect(() => {
    if (!focusedCodename) return
    const el = rowRefs.current.get(focusedCodename)
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedCodename])

  function handleTableKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (rows.length === 0) return
    const current = focusedCodename
      ? rows.findIndex((r) => r.codename === focusedCodename)
      : 0
    const idx = current < 0 ? 0 : current

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusIndex(Math.min(idx + 1, rows.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusIndex(Math.max(idx - 1, 0))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      focusIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      focusIndex(rows.length - 1)
      return
    }
    if (e.key === ' ') {
      const row = rows[idx]
      if (!row || selectionLocked) return
      e.preventDefault()
      onToggle(row.codename, !selected.has(row.codename))
      onFocusRow(row.codename)
      return
    }
    if (e.key === 'Enter') {
      const row = rows[idx]
      if (!row) return
      e.preventDefault()
      onFocusRow(row.codename)
    }
  }

  return (
    <div
      id={MODS_TABLE_ID}
      className="mods-table-wrap"
      role="grid"
      aria-label="Mods"
      tabIndex={rows.length === 0 ? 0 : -1}
      onKeyDown={handleTableKeyDown}
      onFocus={() => {
        if (!focusedCodename && rows[0]) onFocusRow(rows[0].codename)
      }}
    >
      <table className="mods-table">
        <thead>
          <tr>
            <th className="mods-col-check" scope="col">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                disabled={selectionLocked || rows.length === 0}
                aria-label="Select all visible mods"
                onChange={(e) => onToggleAllVisible(e.target.checked)}
              />
            </th>
            {COLUMNS.map((col) => {
              const active = sortKey === col.key
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={col.className}
                  aria-sort={
                    active
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className={`mods-sort-btn${active ? ' active' : ''}`}
                    onClick={() => onSort(col.key)}
                  >
                    {col.label}
                    <span
                      className={`mods-sort-indicator${active ? ' active' : ''}`}
                      aria-hidden="true"
                    >
                      {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="mods-table-empty">
                No mods match the current filters.
              </td>
            </tr>
          ) : (
            rows.map((mod) => {
              const eff = effectiveModFields(mod)
              const checked = selected.has(mod.codename)
              const focused = focusedCodename === mod.codename
              const author = primaryAuthorLabel(eff.author)
              return (
                <tr
                  key={mod.codename}
                  ref={(el) => {
                    if (el) rowRefs.current.set(mod.codename, el)
                    else rowRefs.current.delete(mod.codename)
                  }}
                  className={`mods-row${focused ? ' focused' : ''}${
                    checked ? ' selected' : ''
                  }`}
                  role="row"
                  tabIndex={focused ? 0 : -1}
                  aria-selected={checked}
                  onClick={() => {
                    onFocusRow(mod.codename)
                    requestAnimationFrame(() => {
                      rowRefs.current.get(mod.codename)?.focus()
                    })
                  }}
                  onFocus={() => onFocusRow(mod.codename)}
                >
                  <td
                    className="mods-col-check"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={selectionLocked}
                      tabIndex={-1}
                      aria-label={`Select ${displayModName(mod)}`}
                      onChange={(e) =>
                        onToggle(mod.codename, e.target.checked)
                      }
                    />
                  </td>
                  <td className="mods-col-name">
                    <span className="mods-name">{displayModName(mod)}</span>
                    {mod.origin === 'user' ? (
                      <span className="mods-origin-tag">Added</span>
                    ) : null}
                  </td>
                  <td className="mods-col-category">{eff.category || '—'}</td>
                  <td className="mods-col-url">
                    {isHttpUrl(eff.url) ? (
                      <a
                        href={eff.url}
                        target="_blank"
                        rel="noreferrer"
                        title={eff.url}
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {eff.url.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span title={eff.url || undefined}>{eff.url || '—'}</span>
                    )}
                  </td>
                  <td className="mods-col-game">{eff.game || '—'}</td>
                  <td className="mods-col-release">{eff.release || '—'}</td>
                  <td className="mods-col-version">{eff.version || '—'}</td>
                  <td className="mods-col-size">{formatModSize(eff.sizeBytes)}</td>
                  <td
                    className="mods-col-author"
                    title={author.title}
                  >
                    {author.display}
                  </td>
                  <td className="mods-col-status">
                    <span className={statusClass(mod.diskStatus)}>
                      {diskStatusLabel(mod.diskStatus)}
                    </span>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
