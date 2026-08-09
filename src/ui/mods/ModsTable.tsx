import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { openExternalUrl } from '../../lib/desktop/openExternalUrl'
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
  /** Active acquire/check progress by codename (0–100 or indeterminate). */
  rowProgress?: ReadonlyMap<string, { pct: number | null; label: string }>
}

const COLUMNS: { key: ModsSortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Name', className: 'mods-col-name' },
  { key: 'category', label: 'Category', className: 'mods-col-category' },
  { key: 'url', label: 'Url', className: 'mods-col-url' },
  { key: 'release', label: 'Release', className: 'mods-col-release' },
  { key: 'version', label: 'Version', className: 'mods-col-version' },
  { key: 'size', label: 'Size', className: 'mods-col-size' },
  { key: 'author', label: 'Author', className: 'mods-col-author' },
  { key: 'status', label: 'Status', className: 'mods-col-status' },
]

function statusClass(status: WorkingMod['diskStatus']): string {
  return `mods-status mods-status-${status}`
}

/** Immediate hover tip (engine / icon-tip style — no native title delay). */
function TipCell({
  className,
  display,
  tip,
}: {
  className: string
  display: ReactNode
  tip: string | undefined
}) {
  const showTip = !!tip
  return (
    <td className={`${className}${showTip ? ' has-icon-tip' : ''}`}>
      <span className="mods-cell-clip">{display}</span>
      {showTip ? (
        <span className="icon-tip" role="tooltip">
          {tip}
        </span>
      ) : null}
    </td>
  )
}

function UrlCopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy(e: ReactMouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <button
      type="button"
      className="mods-url-copy has-icon-tip"
      tabIndex={-1}
      onClick={(e) => void onCopy(e)}
      aria-label={copied ? 'Copied' : 'Copy URL'}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 4.6-4.6L12.2 5.5z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.5 2A1.5 1.5 0 0 0 4 3.5v7A1.5 1.5 0 0 0 5.5 12h5A1.5 1.5 0 0 0 12 10.5v-7A1.5 1.5 0 0 0 10.5 2zm0 1h5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5zM2.5 5v7.5A1.5 1.5 0 0 0 4 14h6.5v-1H4a.5.5 0 0 1-.5-.5V5z"
          />
        </svg>
      )}
      <span className="icon-tip" role="tooltip">
        {copied ? 'Copied' : 'Copy URL'}
      </span>
    </button>
  )
}

type RowProgress = { pct: number | null; label: string }

interface ModsTableRowProps {
  mod: WorkingMod
  checked: boolean
  focused: boolean
  selectionLocked: boolean
  progress: RowProgress | undefined
  onToggle: (codename: string, want: boolean) => void
  onFocusRow: (codename: string) => void
  setRowEl: (codename: string, el: HTMLTableRowElement | null) => void
}

const ModsTableRow = memo(function ModsTableRow({
  mod,
  checked,
  focused,
  selectionLocked,
  progress,
  onToggle,
  onFocusRow,
  setRowEl,
}: ModsTableRowProps) {
  const eff = effectiveModFields(mod)
  const author = primaryAuthorLabel(eff.author)

  return (
    <tr
      ref={(el) => setRowEl(mod.codename, el)}
      className={`mods-row${focused ? ' focused' : ''}${
        checked ? ' selected' : ''
      }${progress ? ' busy' : ''}`}
      role="row"
      tabIndex={focused ? 0 : -1}
      aria-selected={checked}
      onClick={() => {
        onFocusRow(mod.codename)
      }}
      onDoubleClick={() => {
        if (selectionLocked) return
        onToggle(mod.codename, !checked)
      }}
      onFocus={() => {
        if (!focused) onFocusRow(mod.codename)
      }}
    >
      <td className="mods-col-check" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          disabled={selectionLocked}
          tabIndex={-1}
          aria-label={`Select ${displayModName(mod)}`}
          onChange={(e) => onToggle(mod.codename, e.target.checked)}
        />
      </td>
      <td className="mods-col-name">
        <span className="mods-name">{displayModName(mod)}</span>
        {mod.origin === 'user' ? (
          <span className="mods-origin-tag">Added</span>
        ) : null}
        {progress ? (
          <span className="mods-row-progress">
            <span
              className="mods-row-progress-bar"
              style={
                progress.pct != null ? { width: `${progress.pct}%` } : undefined
              }
              data-indeterminate={progress.pct == null ? 'true' : undefined}
            />
            <span className="mods-row-progress-label">{progress.label}</span>
          </span>
        ) : null}
      </td>
      <td className="mods-col-category">{eff.category || '—'}</td>
      <TipCell
        className="mods-col-url"
        display={
          isHttpUrl(eff.url) ? (
            <span className="mods-url-cell">
              <a
                href={eff.url}
                target="_blank"
                rel="noreferrer"
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void openExternalUrl(eff.url)
                }}
              >
                {eff.url.replace(/^https?:\/\//, '')}
              </a>
              <UrlCopyButton url={eff.url} />
            </span>
          ) : (
            eff.url || '—'
          )
        }
        tip={eff.url.trim() || undefined}
      />
      <td className="mods-col-release">{eff.release || '—'}</td>
      <TipCell
        className="mods-col-version"
        display={eff.version || '—'}
        tip={eff.version.trim() || undefined}
      />
      <td className="mods-col-size">{formatModSize(eff.sizeBytes)}</td>
      <TipCell
        className="mods-col-author"
        display={author.display}
        tip={author.title}
      />
      <td className="mods-col-status">
        <span className={statusClass(mod.diskStatus)}>
          {diskStatusLabel(mod.diskStatus)}
        </span>
      </td>
    </tr>
  )
})

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
  rowProgress,
}: Props) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.codename))
  const someSelected =
    !allSelected && rows.some((r) => selected.has(r.codename))

  const setRowEl = useCallback(
    (codename: string, el: HTMLTableRowElement | null) => {
      if (el) rowRefs.current.set(codename, el)
      else rowRefs.current.delete(codename)
    },
    [],
  )

  const focusIndex = useCallback(
    (index: number) => {
      const row = rows[index]
      if (!row) return
      onFocusRow(row.codename)
      requestAnimationFrame(() => {
        const el = rowRefs.current.get(row.codename)
        if (el && document.activeElement !== el) el.focus()
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
            rows.map((mod) => (
              <ModsTableRow
                key={mod.codename}
                mod={mod}
                checked={selected.has(mod.codename)}
                focused={focusedCodename === mod.codename}
                selectionLocked={selectionLocked}
                progress={rowProgress?.get(mod.codename)}
                onToggle={onToggle}
                onFocusRow={onFocusRow}
                setRowEl={setRowEl}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
