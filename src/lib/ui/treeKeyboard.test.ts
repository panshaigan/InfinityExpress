import { describe, expect, it } from 'vitest'
import type { DisplayNode } from '../selection/visibility'
import type { ContainerNode } from '../xml/schema'
import {
  buildTreeKeyboardContext,
  collectExpandableDescendantKeys,
  flattenVisibleRows,
  resolveTreeKey,
} from './treeKeyboard'

function container(
  key: string,
  tag: string,
  children: DisplayNode[] = [],
): DisplayNode {
  const node: ContainerNode = {
    kind: 'container',
    key,
    tag,
    attrs: {},
    children: [],
    effectiveEngine: '',
  }
  return { node, children }
}

function leaf(key: string, tag = 'component'): DisplayNode {
  return {
    node: {
      kind: 'component',
      key,
      tag,
      attrs: {},
      children: [],
      componentId: key,
      orderIndex: 0,
      effectiveEngine: '',
    },
    children: [],
  }
}

const sampleTree: DisplayNode[] = [
  container('a', 'group', [
    leaf('a1'),
    container('a2', 'mod', [leaf('a2a'), leaf('a2b')]),
  ]),
  leaf('b'),
]

describe('flattenVisibleRows', () => {
  it('hides children of collapsed parents', () => {
    const rows = flattenVisibleRows(sampleTree, new Set())
    expect(rows.map((r) => r.key)).toEqual(['a', 'b'])
  })

  it('includes children when expanded', () => {
    const rows = flattenVisibleRows(sampleTree, new Set(['a']))
    expect(rows.map((r) => r.key)).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('nests further when nested parents expanded', () => {
    const rows = flattenVisibleRows(sampleTree, new Set(['a', 'a2']))
    expect(rows.map((r) => r.key)).toEqual(['a', 'a1', 'a2', 'a2a', 'a2b', 'b'])
    expect(rows.find((r) => r.key === 'a2a')?.parentKey).toBe('a2')
  })
})

describe('collectExpandableDescendantKeys', () => {
  it('collects foldable keys under a subtree', () => {
    expect(collectExpandableDescendantKeys(sampleTree[0]!)).toEqual(['a', 'a2'])
  })
})

describe('resolveTreeKey', () => {
  const expanded = new Set(['a', 'a2'])

  it('moves down and up among visible rows', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, expanded, 'a1')
    expect(resolveTreeKey('ArrowDown', ctx)).toEqual({ type: 'move', key: 'a2' })
    expect(resolveTreeKey('ArrowUp', ctx)).toEqual({ type: 'move', key: 'a' })
  })

  it('Home and End jump to ends', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, expanded, 'a2')
    expect(resolveTreeKey('Home', ctx)).toEqual({ type: 'move', key: 'a' })
    expect(resolveTreeKey('End', ctx)).toEqual({ type: 'move', key: 'b' })
  })

  it('ArrowRight expands a collapsed foldable row', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, new Set(), 'a')
    expect(resolveTreeKey('ArrowRight', ctx)).toEqual({ type: 'expand', key: 'a' })
  })

  it('ArrowRight moves into first child when already expanded', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, new Set(['a']), 'a')
    expect(resolveTreeKey('ArrowRight', ctx)).toEqual({ type: 'move', key: 'a1' })
  })

  it('ArrowLeft collapses an expanded foldable row', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, new Set(['a']), 'a')
    expect(resolveTreeKey('ArrowLeft', ctx)).toEqual({ type: 'collapse', key: 'a' })
  })

  it('ArrowLeft moves to parent when collapsed or leaf', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, new Set(['a']), 'a1')
    expect(resolveTreeKey('ArrowLeft', ctx)).toEqual({ type: 'move', key: 'a' })
  })

  it('Space toggles check on focused row', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, expanded, 'a1')
    expect(resolveTreeKey(' ', ctx)).toEqual({ type: 'toggleCheck', key: 'a1' })
  })

  it('* expands subtree', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, new Set(), 'a')
    expect(resolveTreeKey('*', ctx)).toEqual({ type: 'expandSubtree', key: 'a' })
  })

  it('Enter focuses detail', () => {
    const ctx = buildTreeKeyboardContext(sampleTree, expanded, 'b')
    expect(resolveTreeKey('Enter', ctx)).toEqual({ type: 'focusDetail', key: 'b' })
  })
})
