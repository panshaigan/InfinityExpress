import {
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react'
import type { SelectedGame } from '../lib/xml/schema'
import {
  formatSearchPath,
  type GlobalSearchHit,
} from '../lib/selection/globalSearch'
import { displaySelectionState } from '../lib/selection/selectionEngine'
import type { DisplayNode } from '../lib/selection/visibility'
import { statusBadgeClass } from '../lib/badges/statusBadge'
import { EmptyPanel } from './EmptyPanel'
import { IconTip } from './IconTip'
import { JumpIcon } from './JumpIcon'

interface Props {
  hits: GlobalSearchHit[]
  selectedIds: ReadonlySet<string>
  game: SelectedGame
  focusedComponentId: string | null
  onFocus: (componentId: string) => void
  onHover: (componentId: string | null) => void
  onToggle: (display: DisplayNode, wantSelected: boolean) => void
  onJump: (componentId: string) => void
  /** Current search box text (may be empty). */
  searchQuery: string
  /** True when Level / Size / Author / hidden / unchecked filters change results. */
  filtersActive: boolean
  /** True while the all-stations scan is in progress. */
  loading?: boolean
  selectionLockedIds?: ReadonlySet<string> | null
  installedComponentIds?: ReadonlySet<string>
}

function emptyCopy(searchQuery: string, filtersActive: boolean): {
  title: string
  body: string
} {
  const q = searchQuery.trim()
  if (!q && !filtersActive) {
    return {
      title: 'Search the whole route',
      body: 'Type a mod or component name above. Locked options stay listed until their requirements are met — then jump to their station when you are ready.',
    }
  }
  if (q && filtersActive) {
    return {
      title: 'No matches in this net',
      body: 'Nothing fits that search with the current filters. Try fewer words, or clear filters to widen the hunt.',
    }
  }
  if (q) {
    return {
      title: 'No matches',
      body: 'Nothing fits that search. Try a shorter phrase, or browse from the rail instead.',
    }
  }
  return {
    title: 'Filters hid every match',
    body: 'Clear Level, Size, Author, or the other filter chips to see components again.',
  }
}

export function GlobalSearchList({
  hits,
  selectedIds,
  game,
  focusedComponentId,
  onFocus,
  onHover,
  onToggle,
  onJump,
  searchQuery,
  filtersActive,
  loading = false,
  selectionLockedIds = null,
  installedComponentIds,
}: Props) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const tabbableId =
    focusedComponentId && hits.some((h) => h.component.componentId === focusedComponentId)
      ? focusedComponentId
      : (hits[0]?.component.componentId ?? null)

  useEffect(() => {
    if (!focusedComponentId) return
    const el = rowRefs.current.get(focusedComponentId)
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedComponentId])

  function focusIndex(index: number) {
    const hit = hits[index]
    if (!hit) return
    onFocus(hit.component.componentId)
    requestAnimationFrame(() => {
      rowRefs.current.get(hit.component.componentId)?.focus()
    })
  }

  function handleListKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (hits.length === 0) return
    const current = focusedComponentId
      ? hits.findIndex((h) => h.component.componentId === focusedComponentId)
      : 0
    const idx = current < 0 ? 0 : current

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusIndex(Math.min(idx + 1, hits.length - 1))
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
      focusIndex(hits.length - 1)
      return
    }
    if (e.key === ' ' || e.key === 'Enter') {
      const hit = hits[idx]
      if (!hit || !hit.checkable || selectionLockedIds?.has(hit.component.componentId)) return
      e.preventDefault()
      const display: DisplayNode = { node: hit.component, children: [] }
      const state = displaySelectionState(display, selectedIds, game)
      onToggle(display, state !== 'checked')
    }
  }

  if (loading && hits.length === 0) {
    return (
      <div
        className="global-search-loading"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="global-search-loading-track" aria-hidden="true">
          <div className="global-search-loading-bar" />
        </div>
        <p className="global-search-loading-title">Gathering components</p>
        <p className="global-search-loading-body">
          Scanning every station for matches…
        </p>
      </div>
    )
  }

  if (hits.length === 0) {
    const copy = emptyCopy(searchQuery, filtersActive)
    return (
      <EmptyPanel title={copy.title} className="empty-panel-search">
        {copy.body}
      </EmptyPanel>
    )
  }

  return (
    <div
      className={`global-search-list${loading ? ' is-loading' : ''}`}
      role="listbox"
      aria-label="Search results"
      aria-busy={loading || undefined}
      onKeyDown={handleListKeyDown}
      onMouseLeave={() => onHover(null)}
    >
      {loading && (
        <div className="global-search-loading-track sticky" aria-hidden="true">
          <div className="global-search-loading-bar" />
        </div>
      )}
      {hits.map((hit) => {
        const id = hit.component.componentId
        const display: DisplayNode = { node: hit.component, children: [] }
        const installLocked = !!selectionLockedIds?.has(id)
        const checkable = hit.checkable && !installLocked
        const state = displaySelectionState(display, selectedIds, game)
        const checked = state === 'checked'
        const focused = focusedComponentId === id
        const showInstalledBadge = !!installedComponentIds?.has(id)
        const label =
          hit.component.attrs.label ?? hit.component.attrs.name ?? id
        const path = formatSearchPath(hit.pathLabels)

        function handleRowClick() {
          onFocus(id)
        }

        function handleRowDoubleClick() {
          if (checkable) onToggle(display, !checked)
        }

        function handleRowFocus() {
          onFocus(id)
        }

        function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
          if (!checkable) return
          onFocus(id)
          onToggle(display, e.target.checked)
        }

        function handleInputClick(e: MouseEvent) {
          e.stopPropagation()
        }

        function handleJump(e: MouseEvent) {
          e.stopPropagation()
          onJump(id)
        }

        return (
          <div
            key={id}
            role="option"
            aria-selected={focused}
            aria-disabled={!checkable}
            tabIndex={tabbableId === id ? 0 : -1}
            className={`global-search-row${focused ? ' focused' : ''}${
              !checkable ? ' gated' : ''
            }`}
            onClick={handleRowClick}
            onDoubleClick={handleRowDoubleClick}
            onFocus={handleRowFocus}
            onMouseEnter={() => onHover(id)}
            ref={(el) => {
              if (el) rowRefs.current.set(id, el)
              else rowRefs.current.delete(id)
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!checkable}
              tabIndex={-1}
              aria-label={label}
              onChange={handleInputChange}
              onClick={handleInputClick}
            />
            <div className="global-search-text">
              <span className="global-search-label">{label}</span>
              <span className="global-search-path">
                {!hit.checkable
                  ? 'Locked until requirements are met · '
                  : installLocked
                    ? 'Locked by install progress · '
                    : ''}
                {path}
              </span>
            </div>
            {checkable && hit.component.attrs.required && (
              <span className="badge">required</span>
            )}
            {checkable && hit.component.attrs.noDisplay && (
              <span className="badge">hidden</span>
            )}
            {showInstalledBadge && (
              <span className={statusBadgeClass('installed')}>Installed</span>
            )}
            {!checkable && (
              <span
                className="badge badge-gated has-icon-tip"
              >
                locked
                <span className="icon-tip" role="tooltip">
                  {installLocked
                    ? 'Cannot change during this install run'
                    : 'Needs another component first'}
                </span>
              </span>
            )}
            {checkable && (
              <button
                type="button"
                className="global-search-jump has-icon-tip"
                tabIndex={-1}
                aria-label={`Jump to ${label} in its station`}
                onClick={handleJump}
              >
                <JumpIcon />
                <IconTip>Jump to station</IconTip>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
