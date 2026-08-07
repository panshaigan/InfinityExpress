import type { DisplayNode } from './visibility'

export function findDisplayNode(nodes: DisplayNode[], key: string): DisplayNode | null {
  for (const n of nodes) {
    if (n.node.key === key) return n
    const found = findDisplayNode(n.children, key)
    if (found) return found
  }
  return null
}

export function findDisplayByComponentId(
  nodes: DisplayNode[],
  componentId: string,
): DisplayNode | null {
  for (const n of nodes) {
    if (n.collapsedComponent?.componentId === componentId) return n
    if (n.node.kind === 'component' && n.node.componentId === componentId) return n
    const found = findDisplayByComponentId(n.children, componentId)
    if (found) return found
  }
  return null
}

/** Path from a content main branch down to the node that owns `componentId`. */
export function findPathToComponent(
  nodes: DisplayNode[],
  componentId: string,
  path: DisplayNode[] = [],
): DisplayNode[] | null {
  for (const n of nodes) {
    const next = [...path, n]
    if (n.collapsedComponent?.componentId === componentId) return next
    if (n.node.kind === 'component' && n.node.componentId === componentId) return next
    const found = findPathToComponent(n.children, componentId, next)
    if (found) return found
  }
  return null
}
