import {
  displayModName,
  diskStatusLabel,
  formatModSize,
  type ModsSortDir,
  type ModsSortKey,
} from '../../lib/mods/modsTable'
import { effectiveModFields, type WorkingMod } from '../../lib/mods/loadMods'
import { isHttpUrl } from '../../lib/url'

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
  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.codename))
  const someSelected =
    !allSelected && rows.some((r) => selected.has(r.codename))

  return (
    <div className="mods-table-wrap">
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
                    {active ? (
                      <span aria-hidden="true">
                        {sortDir === 'asc' ? ' ↑' : ' ↓'}
                      </span>
                    ) : null}
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
              return (
                <tr
                  key={mod.codename}
                  className={`mods-row${focused ? ' focused' : ''}${
                    checked ? ' selected' : ''
                  }`}
                  onClick={() => onFocusRow(mod.codename)}
                >
                  <td
                    className="mods-col-check"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={selectionLocked}
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
                  <td className="mods-col-author">{eff.author || '—'}</td>
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
