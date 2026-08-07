import type { ContainerNode, TreeNode } from './schema'

/** Containers that never reunite across split station blocks (even with the same tag). */
export const NEVER_MERGE_TAGS = new Set(['group', 'mod'])

/**
 * Merge key for sibling folding. Same tag merges unless the node is a component,
 * alternatives, or a never-merge tag (`group`, `mod`). Named section tags
 * (`warriors`, `bg1`, `universalBg`, …) and org folders reunite by tag alone.
 */
export function mergeKey(node: TreeNode): string | null {
  if (node.kind === 'component' || node.kind === 'alternatives') {
    return null
  }
  if (NEVER_MERGE_TAGS.has(node.tag)) {
    return null
  }
  return `tag:${node.tag}`
}

/**
 * Tree-level noBranches flatten: hoist past intermediate grouping so only
 * components and alternatives (and nested noBranches containers) remain.
 * Mirrors display flattening without engine/visibility filters.
 */
export function flattenNoBranchesTreeChildren(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = []

  for (const node of nodes) {
    if (node.kind === 'component') {
      result.push(node)
      continue
    }

    if (node.attrs.noDisplay) {
      result.push(...flattenNoBranchesTreeChildren(node.children))
      continue
    }

    if (node.kind === 'alternatives') {
      result.push(node)
      continue
    }

    // Nested noBranches: keep as its own row with flattened children
    if (node.attrs.noBranches) {
      const container = node as ContainerNode
      container.children = flattenNoBranchesTreeChildren(container.children)
      result.push(container)
      continue
    }

    result.push(...flattenNoBranchesTreeChildren(node.children))
  }

  return result
}

function absorbSibling(target: ContainerNode, incoming: ContainerNode) {
  let children: TreeNode[]
  if (incoming.attrs.noBranches) {
    children = flattenNoBranchesTreeChildren(incoming.children)
  } else {
    if (target.attrs.noBranches) {
      target.children = flattenNoBranchesTreeChildren(target.children)
      delete target.attrs.noBranches
    }
    children = incoming.children
  }
  for (const child of children) {
    child.parentKey = target.key
  }
  target.children = foldSiblings([...target.children, ...children])
}

/**
 * Left-to-right fold of siblings: matching containers absorb later siblings'
 * children (then re-fold). First node's attrs are kept. Contributions from
 * `noBranches` siblings are flattened into the tree at merge time so mixed
 * merges only flatten those sections, not structured siblings.
 */
export function foldSiblings(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = []
  const indexByKey = new Map<string, number>()

  for (const node of nodes) {
    if (node.kind !== 'component' && node.children.length > 0) {
      node.children = foldSiblings(node.children)
    }

    const key = mergeKey(node)
    if (key !== null) {
      const existingIdx = indexByKey.get(key)
      if (existingIdx !== undefined) {
        absorbSibling(result[existingIdx] as ContainerNode, node as ContainerNode)
        continue
      }
      indexByKey.set(key, result.length)
    }
    result.push(node)
  }

  return result
}
