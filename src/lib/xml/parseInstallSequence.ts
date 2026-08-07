import { foldSiblings } from './foldSiblings'
import {
  type ComponentNode,
  type ContainerNode,
  type InstallSequenceModel,
  type NodeAttrs,
  type NodeKind,
  type StationBlock,
  type StationId,
  type TreeNode,
  STATION_ORDER,
  isStationTag,
} from './schema'

function truthyAttr(value: string | null): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

function readAttrs(el: Element): NodeAttrs {
  const g = (name: string) => el.getAttribute(name) ?? undefined
  return {
    id: g('id'),
    sectionId: g('sectionId'),
    label: g('label'),
    desc: g('desc'),
    readme: g('readme'),
    modId: g('modId') ?? g('modid'),
    engine: g('engine'),
    level: g('level'),
    required: truthyAttr(el.getAttribute('required')),
    noDisplay: truthyAttr(el.getAttribute('noDisplay')),
    alwaysIf: g('alwaysIf'),
    displayIf: g('displayIf'),
    displayIfNot: g('displayIfNot'),
    default: truthyAttr(el.getAttribute('default')),
    core: truthyAttr(el.getAttribute('core')),
    noBranches: truthyAttr(el.getAttribute('noBranches')),
    tags: g('tags'),
    unfolded: truthyAttr(el.getAttribute('unfolded')),
  }
}

function kindForTag(tag: string): NodeKind {
  if (tag === 'component') return 'component'
  if (tag === 'alternatives') return 'alternatives'
  if (isStationTag(tag)) return 'station'
  return 'container'
}

function inheritEngine(own: string | undefined, parent: string): string {
  return own?.trim() ? own.trim() : parent
}

function inheritLevel(own: string | undefined, parent: string | undefined): string | undefined {
  return own?.trim() ? own.trim() : parent
}

export interface ParseResult {
  model: InstallSequenceModel
  warnings: string[]
}

export function parseInstallSequence(xmlText: string): ParseResult {
  const warnings: string[] = []
  // XML declaration must be first; tolerate accidental leading BOM/whitespace
  const normalized = xmlText.replace(/^\uFEFF/, '').replace(/^\s+/, '')
  const parser = new DOMParser()
  const doc = parser.parseFromString(normalized, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Invalid InstallSequence.xml: ${parseError.textContent?.trim() ?? 'parse error'}`)
  }

  const root = doc.documentElement
  if (!root || root.tagName !== 'installSequence') {
    throw new Error('Root element must be <installSequence>')
  }

  let keySeq = 0
  let orderIndex = 0
  const nodesByKey = new Map<string, TreeNode>()
  const componentsById = new Map<string, ComponentNode>()
  const componentsInOrder: ComponentNode[] = []
  const stationBuckets = new Map<StationId, ContainerNode[]>()

  function nextKey(prefix: string): string {
    keySeq += 1
    return `${prefix}-${keySeq}`
  }

  function walkElement(
    el: Element,
    parentEngine: string,
    parentLevel: string | undefined,
    parentKey: string | undefined,
  ): TreeNode | null {
    const tag = el.tagName
    if (tag === 'parsererror') return null

    const attrs = readAttrs(el)
    const effectiveEngine = inheritEngine(attrs.engine, parentEngine)
    const effectiveLevel = inheritLevel(attrs.level, parentLevel)
    const kind = kindForTag(tag)
    const key = nextKey(tag)

    if (kind === 'component') {
      const componentId = attrs.id
      if (!componentId) {
        warnings.push(`<component> missing id (label=${attrs.label ?? '?'})`)
        return null
      }
      const node: ComponentNode = {
        key,
        tag,
        kind: 'component',
        attrs,
        effectiveEngine,
        effectiveLevel,
        children: [],
        parentKey,
        componentId,
        orderIndex: orderIndex++,
      }
      nodesByKey.set(key, node)
      componentsById.set(componentId, node)
      componentsInOrder.push(node)
      return node
    }

    const node: ContainerNode = {
      key,
      tag,
      kind: kind === 'alternatives' ? 'alternatives' : kind === 'station' ? 'station' : 'container',
      attrs,
      effectiveEngine,
      effectiveLevel,
      children: [],
      parentKey,
    }
    nodesByKey.set(key, node)

    for (const child of Array.from(el.children)) {
      const childNode = walkElement(child, effectiveEngine, effectiveLevel, key)
      if (childNode) node.children.push(childNode)
    }

    return node
  }

  for (const child of Array.from(root.children)) {
    const tag = child.tagName
    if (!isStationTag(tag)) {
      warnings.push(`Skipping unknown top-level tag <${tag}>`)
      continue
    }
    const stationNode = walkElement(child, '', undefined, undefined)
    if (!stationNode || stationNode.kind === 'component') continue
    const list = stationBuckets.get(tag) ?? []
    list.push(stationNode as ContainerNode)
    stationBuckets.set(tag, list)
  }

  const stations: StationBlock[] = STATION_ORDER.filter((id) => stationBuckets.has(id)).map(
    (stationId) => {
      const roots = stationBuckets.get(stationId)!
      const children = foldSiblings(roots.flatMap((r) => r.children))
      return { stationId, roots, children }
    },
  )

  return {
    model: {
      stations,
      componentsById,
      componentsInOrder,
      nodesByKey,
    },
    warnings,
  }
}

export function getStationChildren(
  model: InstallSequenceModel,
  stationId: StationId,
): TreeNode[] {
  return model.stations.find((s) => s.stationId === stationId)?.children ?? []
}
