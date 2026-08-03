import type { ContainerNode, TreeNode } from './schema'

/** Org folders that reunite by tag alone when duplicate stations are folded. */
export const STRUCTURAL_MERGE_TAGS = new Set([
  'add',
  'update',
  'upgrade',
  'delete',
  'tweaks',
  'items',
  'npc',
  'romances',
  'quest',
])

/**
 * Merge key for sibling folding. `sectionId` wins when present.
 * Structural org tags fall back to tag alone. Mods / components / alternatives never merge.
 */
export function mergeKey(node: TreeNode): string | null {
  if (node.kind === 'component' || node.kind === 'alternatives' || node.tag === 'mod') {
    return null
  }
  if (node.attrs.sectionId) {
    return `sectionId:${node.attrs.sectionId}`
  }
  if (STRUCTURAL_MERGE_TAGS.has(node.tag)) {
    return `tag:${node.tag}`
  }
  return null
}

/**
 * Left-to-right fold of siblings: matching containers absorb later siblings'
 * children (then re-fold). First node's attrs are kept.
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
        const target = result[existingIdx] as ContainerNode
        const incoming = (node as ContainerNode).children
        for (const child of incoming) {
          child.parentKey = target.key
        }
        target.children = foldSiblings([...target.children, ...incoming])
        continue
      }
      indexByKey.set(key, result.length)
    }
    result.push(node)
  }

  return result
}
