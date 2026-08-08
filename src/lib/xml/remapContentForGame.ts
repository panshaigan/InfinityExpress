import type { ComponentNode, ContainerNode, SelectedGame, TreeNode } from './schema'
import { foldSiblings } from './foldSiblings'

const BG_CONTENT = 'universalBg'
const BG_IWD = 'universalBgIwd'
const BG1 = 'bg1'
const BG2 = 'bg2'
const IWD = 'iwd'

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

function findByTag(nodes: TreeNode[], tag: string): ContainerNode | undefined {
  return nodes.find(
    (n): n is ContainerNode => n.kind !== 'component' && n.tag === tag,
  )
}

/** Fold source commons' children into target, then drop those commons from siblings. */
function absorbCommons(
  siblings: TreeNode[],
  targetTag: string,
  sourceTags: string[],
): TreeNode[] {
  const target = findByTag(siblings, targetTag)
  if (!target) return siblings

  const absorbSet = new Set(sourceTags)
  const sources = siblings.filter(
    (n): n is ContainerNode => n.kind !== 'component' && absorbSet.has(n.tag),
  )
  if (sources.length === 0) return siblings

  const incoming = sources.flatMap((s) => s.children)
  for (const child of incoming) {
    child.parentKey = target.key
  }
  target.children = foldSiblings([...target.children, ...incoming])

  return siblings.filter((n) => !absorbSet.has(n.tag))
}

/** Cache remounts by source children identity + game (parsed station trees are stable). */
const remapCache = new WeakMap<TreeNode[], Map<SelectedGame, TreeNode[]>>()

function remountContent(children: TreeNode[], game: SelectedGame): TreeNode[] {
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

/**
 * Game-dependent UI remount of content-station commons into the right bucket.
 * Runs on a clone; does not mutate the parsed station children.
 * Results are memoized per `children` reference and game.
 */
export function remapContentForGame(children: TreeNode[], game: SelectedGame): TreeNode[] {
  if (game === 'pst') return children

  let byGame = remapCache.get(children)
  if (!byGame) {
    byGame = new Map()
    remapCache.set(children, byGame)
  }

  const cached = byGame.get(game)
  if (cached) return cached

  const remounted = remountContent(children, game)
  byGame.set(game, remounted)
  return remounted
}
