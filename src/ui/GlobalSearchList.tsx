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

interface Props {
  hits: GlobalSearchHit[]
  selectedIds: ReadonlySet<string>
  game: SelectedGame
  focusedComponentId: string | null
  onFocus: (componentId: string) => void
  onToggle: (display: DisplayNode, wantSelected: boolean) => void
  onJump: (componentId: string) => void
}

function JumpIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.5 2a.5.5 0 0 0 0 1h5.793L2.146 13.146a.5.5 0 1 0 .708.708L13 3.707V9.5a.5.5 0 0 0 1 0v-7A.5.5 0 0 0 13.5 2h-7z"
      />
    </svg>
  )
}

export function GlobalSearchList({
  hits,
  selectedIds,
  game,
  focusedComponentId,
  onFocus,
  onToggle,
  onJump,
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
      if (!hit || !hit.checkable) return
      e.preventDefault()
      const display: DisplayNode = { node: hit.component, children: [] }
      const state = displaySelectionState(display, selectedIds, game)
      onToggle(display, state !== 'checked')
    }
  }

  return (
    <div
      className="global-search-list"
      role="listbox"
      aria-label="Search results"
      onKeyDown={handleListKeyDown}
    >
      {hits.length === 0 ? (
        <p className="global-search-empty">No components match the current filters.</p>
      ) : (
        hits.map((hit) => {
          const id = hit.component.componentId
          const display: DisplayNode = { node: hit.component, children: [] }
          const state = displaySelectionState(display, selectedIds, game)
          const checked = state === 'checked'
          const focused = focusedComponentId === id
          const label =
            hit.component.attrs.label ?? hit.component.attrs.name ?? id
          const path = formatSearchPath(hit.pathLabels)

          function handleRowClick() {
            onFocus(id)
          }

          function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
            if (!hit.checkable) return
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
              aria-disabled={!hit.checkable}
              tabIndex={tabbableId === id ? 0 : -1}
              className={`global-search-row${focused ? ' focused' : ''}${
                !hit.checkable ? ' gated' : ''
              }`}
              onClick={handleRowClick}
              onFocus={handleRowClick}
              ref={(el) => {
                if (el) rowRefs.current.set(id, el)
                else rowRefs.current.delete(id)
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!hit.checkable}
                tabIndex={-1}
                aria-label={label}
                onChange={handleInputChange}
                onClick={handleInputClick}
              />
              <div className="global-search-text">
                <span className="global-search-label">{label}</span>
                <span className="global-search-path">{path}</span>
              </div>
              {hit.component.attrs.required && (
                <span className="badge">required</span>
              )}
              {hit.component.attrs.noDisplay && (
                <span className="badge">hidden</span>
              )}
              {!hit.eligible && <span className="badge">gated</span>}
              {hit.eligible && (
                <button
                  type="button"
                  className="global-search-jump"
                  tabIndex={-1}
                  aria-label={`Jump to ${label} in its station`}
                  title="Jump to station"
                  onClick={handleJump}
                >
                  <JumpIcon />
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
