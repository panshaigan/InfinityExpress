import {
  memo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type MutableRefObject,
} from 'react'
import type { DisplayNode } from '../lib/selection/visibility'
import {
  displaySelectionState,
  type RandomizeOptions,
  type RandomizePercent,
} from '../lib/selection/selectionEngine'
import { isComponentNode, type InstallSequenceModel, type SelectedGame } from '../lib/xml/schema'
import { levelBadgeClass, levelBadgeLabel } from '../lib/levels'
import {
  stabilityBadgeClass,
  stabilityBadgeLabel,
} from '../lib/selection/filterDisplayTree'
import {
  findEnclosingMod,
  hasModField,
  resolveModLookupKey,
  type ModInfo,
  resolveModStability,
} from '../lib/mods/loadMods'
import { statusBadgeClass } from '../lib/badges/statusBadge'
import { hasNestedFoldable } from '../lib/ui/treeKeyboard'
import { FoldAllIcon, UnfoldAllIcon } from './FoldAllIcons'
import { IconTip } from './IconTip'

const RANDOMIZE_PERCENTS: RandomizePercent[] = [25, 50, 75, 100]

function componentIdsInDisplay(display: DisplayNode): string[] {
  if (display.collapsedComponent) return [display.collapsedComponent.componentId]
  if (isComponentNode(display.node)) return [display.node.componentId]
  return display.children.flatMap((child) => componentIdsInDisplay(child))
}

function isDisplaySelectionLocked(
  display: DisplayNode,
  selectionLockedIds: ReadonlySet<string> | null | undefined,
): boolean {
  if (!selectionLockedIds?.size) return false
  return componentIdsInDisplay(display).some((id) => selectionLockedIds.has(id))
}

function ShuffleIcon() {
  return (
    <svg
      className="tree-randomize-icon"
      width="11"
      height="11"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M11.5 1.5 13 3H9.5a4 4 0 0 0-3.5 2l1.1.7A2.5 2.5 0 0 1 9.5 4.5H13l-1.5 1.5L13 7.5 16 4.5 13 1.5l-1.5 0zM4.5 14.5 3 13h3.5a4 4 0 0 0 3.5-2l-1.1-.7A2.5 2.5 0 0 1 6.5 11.5H3l1.5-1.5L3 8.5 0 11.5 3 14.5l1.5 0zM1.5 4h4v1.25h-4zm9 6.75h4V12h-4z"
      />
    </svg>
  )
}

export type CheckboxRowProps = {
  display: DisplayNode
  selectedIds: ReadonlySet<string>
  game: SelectedGame
  model: InstallSequenceModel
  modsByCodename: ReadonlyMap<string, ModInfo>
  focusedKey: string | null
  /** Row that holds tabIndex={0} (roving tabindex). */
  tabbableKey: string | null
  onFocus: (key: string) => void
  onHover: (key: string | null) => void
  onToggle: (display: DisplayNode, wantSelected: boolean) => void
  onRandomize: (display: DisplayNode, options: RandomizeOptions) => void
  randomizeMenuKey: string | null
  onRandomizeMenuKeyChange: (key: string | null) => void
  depth: number
  expandedKeys: ReadonlySet<string>
  onToggleExpand: (key: string) => void
  onExpandSubtree: (key: string) => void
  onCollapseSubtree: (key: string) => void
  /** When set, this row is a mutually exclusive option under an alternatives parent. */
  exclusiveGroupKey?: string
  /** True when the display parent has noBranches (mod rows hoisted away). */
  parentNoBranches?: boolean
  rowRefs: MutableRefObject<Map<string, HTMLDivElement>>
  /** When true, checkboxes and editing controls are disabled (station finished). */
  readonly?: boolean
  /** Component ids whose checkboxes are locked by install progress. */
  selectionLockedIds?: ReadonlySet<string> | null
  /** Component ids with a physically installed install step. */
  installedComponentIds?: ReadonlySet<string>
}

function subtreeSelectionChanged(
  display: DisplayNode,
  prev: ReadonlySet<string>,
  next: ReadonlySet<string>,
): boolean {
  if (prev === next) return false

  function walk(d: DisplayNode): boolean {
    if (d.collapsedComponent) {
      const id = d.collapsedComponent.componentId
      return prev.has(id) !== next.has(id)
    }
    if (isComponentNode(d.node)) {
      return prev.has(d.node.componentId) !== next.has(d.node.componentId)
    }
    for (const child of d.children) {
      if (walk(child)) return true
    }
    return false
  }

  return walk(display)
}

function subtreeExpandedChanged(
  display: DisplayNode,
  prevKeys: ReadonlySet<string>,
  nextKeys: ReadonlySet<string>,
): boolean {
  if (prevKeys === nextKeys) return false

  function walk(d: DisplayNode): boolean {
    if (d.children.length > 0) {
      if (prevKeys.has(d.node.key) !== nextKeys.has(d.node.key)) return true
      for (const child of d.children) {
        if (walk(child)) return true
      }
    }
    return false
  }

  return walk(display)
}

function displayContainsKey(display: DisplayNode, key: string | null): boolean {
  if (key == null) return false
  if (display.node.key === key) return true
  return display.children.some((child) => displayContainsKey(child, key))
}

function subtreeKeyPropChanged(
  display: DisplayNode,
  prevKey: string | null,
  nextKey: string | null,
): boolean {
  if (prevKey === nextKey) return false
  return displayContainsKey(display, prevKey) || displayContainsKey(display, nextKey)
}

function checkboxRowPropsAreEqual(
  prev: CheckboxRowProps,
  next: CheckboxRowProps,
): boolean {
  if (prev.display !== next.display) return false
  if (prev.game !== next.game) return false
  if (prev.model !== next.model) return false
  if (prev.modsByCodename !== next.modsByCodename) return false
  if (prev.depth !== next.depth) return false
  if (prev.exclusiveGroupKey !== next.exclusiveGroupKey) return false
  if (prev.parentNoBranches !== next.parentNoBranches) return false
  if (prev.readonly !== next.readonly) return false
  if (prev.selectionLockedIds !== next.selectionLockedIds) return false
  if (prev.installedComponentIds !== next.installedComponentIds) return false
  if (prev.onFocus !== next.onFocus) return false
  if (prev.onHover !== next.onHover) return false
  if (prev.onToggle !== next.onToggle) return false
  if (prev.onRandomize !== next.onRandomize) return false
  if (prev.onToggleExpand !== next.onToggleExpand) return false
  if (prev.onExpandSubtree !== next.onExpandSubtree) return false
  if (prev.onCollapseSubtree !== next.onCollapseSubtree) return false
  if (prev.onRandomizeMenuKeyChange !== next.onRandomizeMenuKeyChange) return false
  if (prev.rowRefs !== next.rowRefs) return false

  if (subtreeKeyPropChanged(prev.display, prev.focusedKey, next.focusedKey)) {
    return false
  }
  if (subtreeKeyPropChanged(prev.display, prev.tabbableKey, next.tabbableKey)) {
    return false
  }
  if (
    subtreeKeyPropChanged(prev.display, prev.randomizeMenuKey, next.randomizeMenuKey)
  ) {
    return false
  }

  if (subtreeExpandedChanged(prev.display, prev.expandedKeys, next.expandedKeys)) {
    return false
  }

  if (subtreeSelectionChanged(prev.display, prev.selectedIds, next.selectedIds)) {
    return false
  }

  return true
}

export const CheckboxRow = memo(function CheckboxRow({
  display,
  selectedIds,
  game,
  model,
  modsByCodename,
  focusedKey,
  tabbableKey,
  onFocus,
  onHover,
  onToggle,
  onRandomize,
  randomizeMenuKey,
  onRandomizeMenuKeyChange,
  depth,
  expandedKeys,
  onToggleExpand,
  onExpandSubtree,
  onCollapseSubtree,
  exclusiveGroupKey,
  parentNoBranches = false,
  rowRefs,
  readonly = false,
  selectionLockedIds = null,
  installedComponentIds,
}: CheckboxRowProps) {
  const { node, collapsedComponent, children } = display
  const state = displaySelectionState(display, selectedIds, game)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const foldable = children.length > 0
  const expanded = foldable && expandedKeys.has(node.key)
  const showSubtreeFold = foldable && hasNestedFoldable(display)
  const menuOpen = foldable && randomizeMenuKey === node.key
  const [keepSelected, setKeepSelected] = useState(false)
  const focused = focusedKey === node.key
  const isAlternatives = node.kind === 'alternatives'
  const isExclusiveOption = exclusiveGroupKey != null
  // Exclusive branch radios light up for any selection under the option (incl. partial).
  const checked = isExclusiveOption ? state !== 'unchecked' : state === 'checked'
  const selectionLocked = isDisplaySelectionLocked(display, selectionLockedIds)
  const inputDisabled = readonly || selectionLocked
  const componentIdForBadge =
    collapsedComponent?.componentId ??
    (isComponentNode(node) ? node.componentId : null)
  const showInstalledBadge =
    componentIdForBadge != null &&
    !!installedComponentIds?.has(componentIdForBadge)

  useEffect(() => {
    if (inputRef.current && !isExclusiveOption) {
      inputRef.current.indeterminate = state === 'indeterminate'
    }
  }, [state, isExclusiveOption])

  useEffect(() => {
    if (!menuOpen) {
      setKeepSelected(false)
      return
    }
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (menuRef.current?.contains(target)) return
      onRandomizeMenuKeyChange(null)
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onRandomizeMenuKeyChange(null)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [menuOpen, onRandomizeMenuKeyChange])

  const source = collapsedComponent ?? node
  const attrs = source.attrs
  const label =
    node.attrs.label ??
    (collapsedComponent ? collapsedComponent.attrs.label : undefined) ??
    node.tag
  const level = collapsedComponent?.effectiveLevel ?? node.effectiveLevel
  const stability = resolveModStability(model, modsByCodename, source)
  const stabilityLabel = stabilityBadgeLabel(stability)
  const stabilityClass = stabilityBadgeClass(stability)
  const isComponentRow = source.tag === 'component'
  const looksLone =
    isComponentRow &&
    (parentNoBranches || findEnclosingMod(model, source) === undefined)
  const modCodename = looksLone ? resolveModLookupKey(model, source) : undefined
  const loneMod = modCodename ? modsByCodename.get(modCodename) : undefined
  const abbr =
    looksLone && loneMod && hasModField(loneMod.abbreviation)
      ? loneMod.abbreviation
      : undefined
  const abbrTip =
    abbr && loneMod && hasModField(loneMod.name) ? loneMod.name : undefined

  function handleFoldClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onToggleExpand(node.key)
    onFocus(node.key)
  }

  function handleFoldDoubleClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleSubtreeFoldClick(e: MouseEvent, action: 'expand' | 'collapse') {
    e.preventDefault()
    e.stopPropagation()
    if (action === 'expand') onExpandSubtree(node.key)
    else onCollapseSubtree(node.key)
    onFocus(node.key)
  }

  function handleRandomizeToggle(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onFocus(node.key)
    onRandomizeMenuKeyChange(menuOpen ? null : node.key)
  }

  function handlePercentClick(e: MouseEvent, percent: RandomizePercent) {
    e.preventDefault()
    e.stopPropagation()
    onRandomize(display, { percent, keepSelected })
    onRandomizeMenuKeyChange(null)
  }

  function handleRowClick() {
    onFocus(node.key)
  }

  function handleRowDoubleClick() {
    if (readonly || selectionLocked) return
    onToggle(display, !checked)
  }

  function handleRowFocus() {
    onFocus(node.key)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    onFocus(node.key)
    onToggle(display, e.target.checked)
  }

  function handleInputClick(e: MouseEvent<HTMLInputElement>) {
    e.stopPropagation()
    // Radios don't fire change when re-clicking the selected option; allow deselect.
    if (isExclusiveOption && checked) {
      e.preventDefault()
      onFocus(node.key)
      onToggle(display, false)
    }
  }

  const childExclusiveKey = isAlternatives ? node.key : undefined

  return (
    <div className="tree-node" style={{ marginLeft: depth * 16 }} role="none">
      <div
        className={`tree-row-wrap${focused ? ' focused' : ''}`}
        role="treeitem"
        tabIndex={tabbableKey === node.key ? 0 : -1}
        aria-expanded={foldable ? expanded : undefined}
        aria-selected={focused}
        aria-label={label}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onFocus={handleRowFocus}
        onMouseEnter={() => onHover(node.key)}
        ref={(el) => {
          if (el) rowRefs.current.set(node.key, el)
          else rowRefs.current.delete(node.key)
        }}
      >
        {foldable ? (
          <button
            type="button"
            className="tree-fold"
            tabIndex={-1}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={handleFoldClick}
            onDoubleClick={handleFoldDoubleClick}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-fold-spacer" />
        )}
        <div className="tree-row">
          <span className={selectionLocked ? 'has-icon-tip' : undefined}>
            <input
              ref={inputRef}
              type={isExclusiveOption ? 'radio' : 'checkbox'}
              name={isExclusiveOption ? exclusiveGroupKey : undefined}
              checked={checked}
              disabled={inputDisabled}
              tabIndex={-1}
              aria-label={label}
              onChange={handleInputChange}
              onClick={handleInputClick}
            />
            {selectionLocked ? (
              <IconTip>Locked by install progress</IconTip>
            ) : null}
          </span>
          <span className="tree-label">{label}</span>
          {foldable && !readonly && (
            <span className="tree-randomize" ref={menuRef}>
              <button
                type="button"
                className={`tree-randomize-btn has-icon-tip${menuOpen ? ' open' : ''}`}
                tabIndex={-1}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label={`Randomise selection under ${label}`}
                onClick={handleRandomizeToggle}
                onDoubleClick={handleFoldDoubleClick}
              >
                <ShuffleIcon />
                <span className="icon-tip" role="tooltip">
                  Randomise selection
                </span>
              </button>
              {menuOpen && (
                <div
                  className="tree-randomize-menu"
                  role="group"
                  aria-label={`Randomise ${label}`}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={handleFoldDoubleClick}
                >
                  <div className="tree-randomize-percents">
                    {RANDOMIZE_PERCENTS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        className="tree-randomize-pct"
                        onClick={(e) => handlePercentClick(e, pct)}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <label className="tree-randomize-keep">
                    <input
                      type="checkbox"
                      checked={keepSelected}
                      onChange={(e) => setKeepSelected(e.target.checked)}
                    />
                    Keep currently selected
                  </label>
                </div>
              )}
            </span>
          )}
          {showSubtreeFold && (
            <span className="tree-fold-all">
              <button
                type="button"
                className="tree-fold-all-btn has-icon-tip"
                tabIndex={-1}
                aria-label={`Unfold all under ${label}`}
                onClick={(e) => handleSubtreeFoldClick(e, 'expand')}
                onDoubleClick={handleFoldDoubleClick}
              >
                <UnfoldAllIcon className="tree-fold-all-icon" />
                <span className="icon-tip" role="tooltip">
                  Unfold all
                </span>
              </button>
              <button
                type="button"
                className="tree-fold-all-btn has-icon-tip"
                tabIndex={-1}
                aria-label={`Fold all under ${label}`}
                onClick={(e) => handleSubtreeFoldClick(e, 'collapse')}
                onDoubleClick={handleFoldDoubleClick}
              >
                <FoldAllIcon className="tree-fold-all-icon" />
                <span className="icon-tip" role="tooltip">
                  Fold all
                </span>
              </button>
            </span>
          )}
          {isAlternatives && (
            <span className={statusBadgeClass('chooseOne')}>choose one</span>
          )}
          {abbr && (
            <span className={`badge badge-mod-abbr${abbrTip ? ' has-icon-tip' : ''}`}>
              {abbr}
              {abbrTip ? (
                <span className="icon-tip" role="tooltip">
                  {abbrTip}
                </span>
              ) : null}
            </span>
          )}
          {level && (
            <span className={levelBadgeClass(level)}>{levelBadgeLabel(level)}</span>
          )}
          {stabilityLabel && stabilityClass && (
            <span className={stabilityClass}>{stabilityLabel}</span>
          )}
          {attrs.required && (
            <span className={statusBadgeClass('required')}>required</span>
          )}
          {attrs.noDisplay && (
            <span className={statusBadgeClass('hidden')}>hidden</span>
          )}
          {showInstalledBadge && (
            <span className={statusBadgeClass('installed')}>Installed</span>
          )}
        </div>
      </div>
      {expanded && (
        <div
          className={
            node.attrs.horizontal
              ? 'tree-children tree-children--horizontal'
              : 'tree-children'
          }
        >
          {children.map((child) => (
            <CheckboxRow
              key={child.node.key}
              display={child}
              selectedIds={selectedIds}
              game={game}
              model={model}
              modsByCodename={modsByCodename}
              focusedKey={focusedKey}
              tabbableKey={tabbableKey}
              onFocus={onFocus}
              onHover={onHover}
              onToggle={onToggle}
              onRandomize={onRandomize}
              randomizeMenuKey={randomizeMenuKey}
              onRandomizeMenuKeyChange={onRandomizeMenuKeyChange}
              depth={node.attrs.horizontal ? depth : depth + 1}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              onExpandSubtree={onExpandSubtree}
              onCollapseSubtree={onCollapseSubtree}
              exclusiveGroupKey={childExclusiveKey}
              parentNoBranches={!!node.attrs.noBranches}
              rowRefs={rowRefs}
              readonly={readonly}
              selectionLockedIds={selectionLockedIds}
              installedComponentIds={installedComponentIds}
            />
          ))}
        </div>
      )}
    </div>
  )
}, checkboxRowPropsAreEqual)
