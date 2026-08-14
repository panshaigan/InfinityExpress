import { evalConditionExpr } from './conditions'
import type { InstallSequenceModel, TreeNode } from '../xml/schema'

export function parentOf(
  model: InstallSequenceModel,
  node: TreeNode,
): TreeNode | undefined {
  return node.parentKey ? model.nodesByKey.get(node.parentKey) : undefined
}

export function findEnclosingMod(
  model: InstallSequenceModel,
  node: TreeNode,
): TreeNode | undefined {
  let cur: TreeNode | undefined = node
  while (cur) {
    if (cur.tag === 'mod') return cur
    cur = parentOf(model, cur)
  }
  return undefined
}

export function findEnclosingAlternatives(
  model: InstallSequenceModel,
  node: TreeNode,
): TreeNode | undefined {
  let cur: TreeNode | undefined = parentOf(model, node)
  while (cur) {
    if (cur.kind === 'alternatives') return cur
    cur = parentOf(model, cur)
  }
  return undefined
}

export function passesDisplayGates(
  node: TreeNode,
  selected: ReadonlySet<string>,
): boolean {
  if (node.attrs.displayIf && !evalConditionExpr(node.attrs.displayIf, selected)) {
    return false
  }
  if (node.attrs.displayIfNot && evalConditionExpr(node.attrs.displayIfNot, selected)) {
    return false
  }
  return true
}

/** True when this node and every ancestor satisfy displayIf / displayIfNot. */
export function passesOwnAndAncestorDisplayGates(
  model: InstallSequenceModel,
  node: TreeNode,
  selected: ReadonlySet<string>,
): boolean {
  let cur: TreeNode | undefined = node
  while (cur) {
    if (!passesDisplayGates(cur, selected)) return false
    cur = parentOf(model, cur)
  }
  return true
}
