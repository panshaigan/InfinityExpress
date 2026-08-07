import { collectConditionIdsFromExpr } from './conditions'
import {
  isComponentNode,
  type InstallSequenceModel,
  type NodeAttrs,
  type StationId,
  type TreeNode,
} from '../xml/schema'

export interface RelatedRef {
  id: string
  label: string
  /** True when the id exists in the model and can be navigated to. */
  navigable: boolean
}

export interface ComponentRelations {
  autoIncludedWhen: RelatedRef[]
  autoIncludes: RelatedRef[]
  shownWhen: RelatedRef[]
  unlocks: RelatedRef[]
  hiddenWhen: RelatedRef[]
  hides: RelatedRef[]
}

export interface RelationIndex {
  stationByComponentId: Map<string, StationId>
  /** componentId → components whose alwaysIf mentions it */
  alwaysIfReferrers: Map<string, string[]>
  displayIfReferrers: Map<string, string[]>
  displayIfNotReferrers: Map<string, string[]>
}

function pushReferrer(map: Map<string, string[]>, targetId: string, referrerId: string) {
  const list = map.get(targetId)
  if (list) {
    if (!list.includes(referrerId)) list.push(referrerId)
  } else {
    map.set(targetId, [referrerId])
  }
}

function indexExpr(
  map: Map<string, string[]>,
  expr: string | undefined,
  referrerId: string,
) {
  for (const id of collectConditionIdsFromExpr(expr)) {
    pushReferrer(map, id, referrerId)
  }
}

export function buildRelationIndex(model: InstallSequenceModel): RelationIndex {
  const stationByComponentId = new Map<string, StationId>()
  const alwaysIfReferrers = new Map<string, string[]>()
  const displayIfReferrers = new Map<string, string[]>()
  const displayIfNotReferrers = new Map<string, string[]>()

  for (const block of model.stations) {
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (isComponentNode(n)) {
          stationByComponentId.set(n.componentId, block.stationId)
        }
        walk(n.children)
      }
    }
    walk(block.children)
  }

  for (const c of model.componentsInOrder) {
    indexExpr(alwaysIfReferrers, c.attrs.alwaysIf, c.componentId)
    indexExpr(displayIfReferrers, c.attrs.displayIf, c.componentId)
    indexExpr(displayIfNotReferrers, c.attrs.displayIfNot, c.componentId)
  }

  return {
    stationByComponentId,
    alwaysIfReferrers,
    displayIfReferrers,
    displayIfNotReferrers,
  }
}

/** Component ids that belong to a station (from a relation index). */
export function componentIdsForStation(
  stationByComponentId: ReadonlyMap<string, StationId>,
  stationId: StationId,
): Set<string> {
  const ids = new Set<string>()
  for (const [id, sid] of stationByComponentId) {
    if (sid === stationId) ids.add(id)
  }
  return ids
}

function toRefs(model: InstallSequenceModel, ids: string[]): RelatedRef[] {
  const seen = new Set<string>()
  const refs: RelatedRef[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const comp = model.componentsById.get(id)
    refs.push({
      id,
      label: comp?.attrs.name ?? comp?.attrs.label ?? id,
      navigable: !!comp,
    })
  }
  return refs
}

function forwardRefs(model: InstallSequenceModel, expr: string | undefined): RelatedRef[] {
  return toRefs(model, collectConditionIdsFromExpr(expr))
}

function reverseRefs(
  model: InstallSequenceModel,
  map: Map<string, string[]>,
  componentId: string | undefined,
): RelatedRef[] {
  if (!componentId) return []
  return toRefs(model, map.get(componentId) ?? [])
}

export function resolveRelations(
  model: InstallSequenceModel,
  index: RelationIndex,
  attrs: NodeAttrs,
  componentId?: string,
): ComponentRelations {
  return {
    autoIncludedWhen: forwardRefs(model, attrs.alwaysIf),
    autoIncludes: reverseRefs(model, index.alwaysIfReferrers, componentId),
    shownWhen: forwardRefs(model, attrs.displayIf),
    unlocks: reverseRefs(model, index.displayIfReferrers, componentId),
    hiddenWhen: forwardRefs(model, attrs.displayIfNot),
    hides: reverseRefs(model, index.displayIfNotReferrers, componentId),
  }
}
