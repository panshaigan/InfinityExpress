import { collectConditionIdsFromExpr } from './conditions'
import type { InstallSequenceModel, TreeNode } from '../xml/schema'

function collectGateIdsFromNodes(nodes: readonly TreeNode[], into: Set<string>) {
  for (const node of nodes) {
    for (const id of collectConditionIdsFromExpr(node.attrs.displayIf)) {
      into.add(id)
    }
    for (const id of collectConditionIdsFromExpr(node.attrs.displayIfNot)) {
      into.add(id)
    }
    if (node.children.length > 0) {
      collectGateIdsFromNodes(node.children, into)
    }
  }
}

/**
 * Component ids referenced by any `displayIf` / `displayIfNot` in the model.
 * Selection changes outside this set cannot alter display-tree structure.
 */
export function collectDisplayGateIds(model: InstallSequenceModel): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const block of model.stations) {
    collectGateIdsFromNodes(block.roots, ids)
    collectGateIdsFromNodes(block.children, ids)
  }
  return ids
}

/**
 * Stable fingerprint of the gating subset of `selectedIds`.
 * Use as a React memo dependency instead of the full selection set when
 * rebuilding visibility / display trees (unless filters also read selection).
 */
export function selectionGateKey(
  selectedIds: ReadonlySet<string>,
  gateIds: ReadonlySet<string>,
): string {
  if (gateIds.size === 0) return ''
  const parts: string[] = []
  for (const id of gateIds) {
    if (selectedIds.has(id)) parts.push(id)
  }
  if (parts.length <= 1) return parts[0] ?? ''
  parts.sort()
  return parts.join('\0')
}
