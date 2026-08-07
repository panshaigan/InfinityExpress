import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
} from 'react'
import type { TreeNode } from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import { findDisplayNode } from '../lib/selection/displayTreeQuery'
import {
  displaySelectionState,
  type RandomizeOptions,
  type RandomizePercent,
} from '../lib/selection/selectionEngine'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import { levelBadgeClass, levelBadgeLabel } from '../lib/levels'
import {
  stabilityBadgeClass,
  stabilityBadgeLabel,
} from '../lib/selection/filterDisplayTree'
import {
  type ModInfo,
  resolveModStability,
} from '../lib/mods/loadMods'
import { statusBadgeClass } from '../lib/badges/statusBadge'
import { isTypingTarget } from '../lib/ui/chromeHotkeys'
import {
  buildTreeKeyboardContext,
  collectAllExpandableKeys,
  collectExpandableDescendantKeys,
  hasNestedFoldable,
  resolveTreeKey,
  type TreeCommand,
} from '../lib/ui/treeKeyboard'
import { EmptyPanel } from './EmptyPanel'

export interface TreeFoldApi {
  foldAll: () => void
  unfoldAll: () => void
}

const RANDOMIZE_PERCENTS: RandomizePercent[] = [25, 50, 75, 100]

interface Props {
  /** Station (and Content branch) identity; used to restore fold state across remounts. */
  treeKey: string
  nodes: DisplayNode[]
  selectedIds: ReadonlySet<string>
  game: SelectedGame
  model: InstallSequenceModel
  modsByCodename: ReadonlyMap<string, ModInfo>
  focusedKey: string | null
  onFocus: (key: string) => void
  onToggle: (display: DisplayNode, wantSelected: boolean) => void
  onRandomize: (display: DisplayNode, options: RandomizeOptions) => void
  /** Registers fold/unfold-all for the current list; cleared on unmount. */
  onFoldApiReady?: (api: TreeFoldApi | null) => void
  /** Optional explanation when the list is empty. */
  emptyTitle?: string
  emptyBody?: string
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

/** Session-scoped expand/collapse per tree; survives remount, resets on page reload. */
const expandedKeysCache = new Map<string, Set<string>>()

const DEFAULT_FOLDED_TAGS = new Set([
  'mod',
  'group',
  'restorations',
  'restructure',
  'alternatives',
  'expansions',
  'romances',
  'bioware',
  'beamdog',
  'custom',
  'banters',
  'tweaks',
  'add',
  'update',
  'upgrade',
  // Named section tags (formerly <group sectionId="…">)
  'warriors',
  'fighter',
  'wizardSlayer',
  'ranger',
  'beastMaster',
  'archer',
  'paladin',
  'inquisitor',
  'monk',
  'rogues',
  'thief',
  'bard',
  'blade',
  'skald',
  'spellcasters',
  'cleric',
  'druid',
  'mage',
  'sorcerer',
  'shaman',
  'multi',
  'universal',
  'feats',
  'weapons',
  'stats',
  'hp',
  'proficiencies',
])

function isDefaultFolded(node: TreeNode): boolean {
  if (node.attrs.unfolded) return false
  return DEFAULT_FOLDED_TAGS.has(node.tag)
}

function collectExpandableKeys(nodes: DisplayNode[], into: Set<string>) {
  for (const d of nodes) {
    if (d.children.length > 0 && !isDefaultFolded(d.node)) {
      into.add(d.node.key)
    }
    collectExpandableKeys(d.children, into)
  }
}


function CheckboxRow({
  display,
  selectedIds,
  game,
  model,
  modsByCodename,
  focusedKey,
  tabbableKey,
  onFocus,
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
  rowRefs,
}: {
  display: DisplayNode
  selectedIds: ReadonlySet<string>
  game: SelectedGame
  model: InstallSequenceModel
  modsByCodename: ReadonlyMap<string, ModInfo>
  focusedKey: string | null
  /** Row that holds tabIndex={0} (roving tabindex). */
  tabbableKey: string | null
  onFocus: (key: string) => void
  onToggle: Props['onToggle']
  onRandomize: Props['onRandomize']
  randomizeMenuKey: string | null
  onRandomizeMenuKeyChange: (key: string | null) => void
  depth: number
  expandedKeys: ReadonlySet<string>
  onToggleExpand: (key: string) => void
  onExpandSubtree: (key: string) => void
  onCollapseSubtree: (key: string) => void
  /** When set, this row is a mutually exclusive option under an alternatives parent. */
  exclusiveGroupKey?: string
  rowRefs: MutableRefObject<Map<string, HTMLDivElement>>
}) {
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

  function handleRowActivate() {
    onFocus(node.key)
  }

  function handleRowFocus() {
    onFocus(node.key)
  }

  function handleRowDoubleClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onFocus(node.key)
    onToggle(display, !checked)
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
        onClick={handleRowActivate}
        onDoubleClick={handleRowDoubleClick}
        onFocus={handleRowFocus}
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
          <input
            ref={inputRef}
            type={isExclusiveOption ? 'radio' : 'checkbox'}
            name={isExclusiveOption ? exclusiveGroupKey : undefined}
            checked={checked}
            tabIndex={-1}
            aria-label={label}
            onChange={handleInputChange}
            onClick={handleInputClick}
          />
          <span className="tree-label">{label}</span>
          {foldable && (
            <span className="tree-randomize" ref={menuRef}>
              <button
                type="button"
                className={`tree-randomize-btn${menuOpen ? ' open' : ''}`}
                tabIndex={-1}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                aria-label={`Randomise selection under ${label}`}
                onClick={handleRandomizeToggle}
                onDoubleClick={handleFoldDoubleClick}
              >
                <ShuffleIcon />
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
                className="tree-fold-all-btn"
                tabIndex={-1}
                aria-label={`Unfold all under ${label}`}
                onClick={(e) => handleSubtreeFoldClick(e, 'expand')}
                onDoubleClick={handleFoldDoubleClick}
              >
                Unfold all
              </button>
              <button
                type="button"
                className="tree-fold-all-btn"
                tabIndex={-1}
                aria-label={`Fold all under ${label}`}
                onClick={(e) => handleSubtreeFoldClick(e, 'collapse')}
                onDoubleClick={handleFoldDoubleClick}
              >
                Fold all
              </button>
            </span>
          )}
          {isAlternatives && (
            <span className={statusBadgeClass('chooseOne')}>choose one</span>
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
        </div>
      </div>
      {expanded &&
        children.map((child) => (
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
            onToggle={onToggle}
            onRandomize={onRandomize}
            randomizeMenuKey={randomizeMenuKey}
            onRandomizeMenuKeyChange={onRandomizeMenuKeyChange}
            depth={depth + 1}
            expandedKeys={expandedKeys}
            onToggleExpand={onToggleExpand}
            onExpandSubtree={onExpandSubtree}
            onCollapseSubtree={onCollapseSubtree}
            exclusiveGroupKey={childExclusiveKey}
            rowRefs={rowRefs}
          />
        ))}
    </div>
  )
}

export function ComponentTree(props: Props) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [randomizeMenuKey, setRandomizeMenuKey] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeysState] = useState<Set<string>>(() => {
    const cached = expandedKeysCache.get(props.treeKey)
    if (cached) return new Set(cached)
    const initial = new Set<string>()
    collectExpandableKeys(props.nodes, initial)
    expandedKeysCache.set(props.treeKey, initial)
    return initial
  })

  function setExpandedKeys(updater: (prev: Set<string>) => Set<string>) {
    setExpandedKeysState((prev) => {
      const next = updater(prev)
      expandedKeysCache.set(props.treeKey, next)
      return next
    })
  }

  // When the display tree changes (station / engine / displayIf), expand newly visible
  // non-default-folded containers without collapsing user-toggled ones.
  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      const addDefaults = (nodes: DisplayNode[]) => {
        for (const d of nodes) {
          if (d.children.length > 0 && !isDefaultFolded(d.node) && !next.has(d.node.key)) {
            next.add(d.node.key)
          }
          addDefaults(d.children)
        }
      }
      addDefaults(props.nodes)
      return next
    })
  }, [props.nodes])

  // Keep DOM focus on the focused row (arrow nav, click, relation jump).
  // Do not steal focus from the filter search (or other typing fields) when the
  // filtered tree remounts on each keystroke — search is display-only.
  useEffect(() => {
    if (!props.focusedKey) return
    const el = rowRefs.current.get(props.focusedKey)
    if (!el) return
    if (isTypingTarget(document.activeElement)) {
      return
    }
    if (document.activeElement !== el) {
      el.focus({ preventScroll: true })
    }
    el.scrollIntoView({ block: 'nearest' })
  }, [props.focusedKey, expandedKeys, props.nodes])

  const keyboardCtx = useMemo(
    () => buildTreeKeyboardContext(props.nodes, expandedKeys, props.focusedKey),
    [props.nodes, expandedKeys, props.focusedKey],
  )

  function onToggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setExpanded(key: string, want: boolean) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (want) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function expandSubtree(key: string) {
    const display = findDisplayNode(props.nodes, key)
    if (!display) return
    const keys = collectExpandableDescendantKeys(display)
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      for (const k of keys) next.add(k)
      return next
    })
  }

  function collapseSubtree(key: string) {
    const display = findDisplayNode(props.nodes, key)
    if (!display) return
    const keys = collectExpandableDescendantKeys(display)
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      for (const k of keys) next.delete(k)
      return next
    })
  }

  useEffect(() => {
    const ready = props.onFoldApiReady
    if (!ready) return
    ready({
      foldAll: () => {
        const keys = collectAllExpandableKeys(props.nodes)
        setExpandedKeys((prev) => {
          const next = new Set(prev)
          for (const k of keys) next.delete(k)
          return next
        })
      },
      unfoldAll: () => {
        const keys = collectAllExpandableKeys(props.nodes)
        setExpandedKeys((prev) => {
          const next = new Set(prev)
          for (const k of keys) next.add(k)
          return next
        })
      },
    })
    return () => ready(null)
  }, [props.nodes, props.onFoldApiReady, props.treeKey])

  function applyCommand(cmd: TreeCommand) {
    switch (cmd.type) {
      case 'move':
      case 'focusDetail':
        props.onFocus(cmd.key)
        break
      case 'expand':
        setExpanded(cmd.key, true)
        props.onFocus(cmd.key)
        break
      case 'collapse':
        setExpanded(cmd.key, false)
        props.onFocus(cmd.key)
        break
      case 'expandSubtree': {
        expandSubtree(cmd.key)
        props.onFocus(cmd.key)
        break
      }
      case 'toggleCheck': {
        const row = keyboardCtx.visibleRows.find((r) => r.key === cmd.key)
        if (!row) break
        const state = displaySelectionState(row.display, props.selectedIds, props.game)
        const isExclusive =
          row.parentKey != null &&
          findDisplayNode(props.nodes, row.parentKey)?.node.kind === 'alternatives'
        const checked = isExclusive ? state !== 'unchecked' : state === 'checked'
        props.onFocus(cmd.key)
        props.onToggle(row.display, !checked)
        break
      }
    }
  }

  function handleTreeKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const cmd = resolveTreeKey(e.key, keyboardCtx)
    if (!cmd) return
    e.preventDefault()
    e.stopPropagation()
    applyCommand(cmd)
  }

  if (props.nodes.length === 0) {
    return (
      <EmptyPanel title={props.emptyTitle ?? 'Nothing on this stop'}>
        {props.emptyBody ??
          'Try clearing filters, or jump to another station from the rail.'}
      </EmptyPanel>
    )
  }

  const tabbableKey = props.focusedKey ?? keyboardCtx.visibleRows[0]?.key ?? null

  return (
    <div
      className="component-tree"
      role="tree"
      aria-label="Components"
      onKeyDown={handleTreeKeyDown}
    >
      {props.nodes.map((n) => (
        <CheckboxRow
          key={n.node.key}
          display={n}
          selectedIds={props.selectedIds}
          game={props.game}
          model={props.model}
          modsByCodename={props.modsByCodename}
          focusedKey={props.focusedKey}
          tabbableKey={tabbableKey}
          onFocus={props.onFocus}
          onToggle={props.onToggle}
          onRandomize={props.onRandomize}
          randomizeMenuKey={randomizeMenuKey}
          onRandomizeMenuKeyChange={setRandomizeMenuKey}
          depth={0}
          expandedKeys={expandedKeys}
          onToggleExpand={onToggleExpand}
          onExpandSubtree={expandSubtree}
          onCollapseSubtree={collapseSubtree}
          rowRefs={rowRefs}
        />
      ))}
    </div>
  )
}
