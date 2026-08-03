import type { ComponentNode, ContainerNode, SelectedGame, TreeNode } from './schema'
import { foldSiblings } from './foldSiblings'

const BG_CONTENT = 'universal-bg-content'
const BG_IWD = 'universal-bg-iwd'
const BG1 = 'bg1-content'
const BG2 = 'bg2-content'
const IWD = 'iwd-content'

/** Deep-clone tree nodes so foldSiblings can mutate without touching the parse model. */
export function cloneTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(cloneNode)
}

function cloneNode(node: TreeNode): TreeNode {
  if (node.kind === 'component') {
    const c: ComponentNode = {
      ...node,
      attrs: { ...node.attrs },
      children: [],
    }
    return c
  }
  const container: ContainerNode = {
    ...node,
    attrs: { ...node.attrs },
    children: cloneTree(node.children),
  }
  for (const child of container.children) {
    child.parentKey = container.key
  }
  return container
}

function findBySectionId(nodes: TreeNode[], sectionId: string): ContainerNode | undefined {
  return nodes.find(
    (n): n is ContainerNode => n.kind !== 'component' && n.attrs.sectionId === sectionId,
  )
}

/** Fold source commons' children into target, then drop those commons from siblings. */
function absorbCommons(
  siblings: TreeNode[],
  targetId: string,
  sourceIds: string[],
): TreeNode[] {
  const target = findBySectionId(siblings, targetId)
  if (!target) return siblings

  const absorbSet = new Set(sourceIds)
  const sources = siblings.filter(
    (n): n is ContainerNode => n.kind !== 'component' && !!n.attrs.sectionId && absorbSet.has(n.attrs.sectionId),
  )
  if (sources.length === 0) return siblings

  const incoming = sources.flatMap((s) => s.children)
  for (const child of incoming) {
    child.parentKey = target.key
  }
  target.children = foldSiblings([...target.children, ...incoming])

  return siblings.filter((n) => !(n.attrs.sectionId && absorbSet.has(n.attrs.sectionId)))
}

/**
 * Game-dependent UI remount of content-station commons into the right bucket.
 * Runs on a clone; does not mutate the parsed station children.
 */
export function remapContentForGame(children: TreeNode[], game: SelectedGame): TreeNode[] {
  if (game === 'pst') return children

  const cloned = cloneTree(children)

  switch (game) {
    case 'bg1':
      return absorbCommons(cloned, BG1, [BG_CONTENT, BG_IWD])
    case 'bg2':
      return absorbCommons(cloned, BG2, [BG_CONTENT, BG_IWD])
    case 'iwd':
      return absorbCommons(cloned, IWD, [BG_IWD])
    case 'eet':
      return absorbCommons(cloned, BG_CONTENT, [BG_IWD])
    default:
      return cloned
  }
}
