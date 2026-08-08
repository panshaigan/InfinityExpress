import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { TreeNode } from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import { findDisplayNode } from '../lib/selection/displayTreeQuery'
import {
  displaySelectionState,
  type RandomizeOptions,
} from '../lib/selection/selectionEngine'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import { type ModInfo } from '../lib/mods/loadMods'
import { isTypingTarget } from '../lib/ui/chromeHotkeys'
import {
  buildTreeKeyboardContext,
  collectAllExpandableKeys,
  collectExpandableDescendantKeys,
  resolveTreeKey,
  type TreeCommand,
} from '../lib/ui/treeKeyboard'
import { EmptyPanel } from './EmptyPanel'
import { CheckboxRow } from './ComponentTreeRow'

export interface TreeFoldApi {
  foldAll: () => void
  unfoldAll: () => void
}

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
