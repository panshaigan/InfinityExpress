export type SelectedGame = 'bg1' | 'bg2' | 'eet' | 'iwd' | 'pst'

export type EngineToken = 'bg' | 'bg1' | 'bg2' | 'eet' | 'eet1' | 'iwd' | 'pst'

export const STATION_ORDER = [
  'base',
  'ui',
  'campaigns',
  'gfx',
  'content',
  'mechanics',
  'spells',
  'npcChoices',
  'combat',
  'sounds',
  'portraits',
  'scripts',
  'randomisation',
  'adjustments',
] as const

export type StationId = (typeof STATION_ORDER)[number]

export const STATION_LABELS: Record<StationId, string> = {
  base: 'Base',
  ui: 'UI',
  campaigns: 'Campaigns',
  gfx: 'GFX',
  content: 'Content',
  mechanics: 'Mechanics',
  spells: 'Spells',
  npcChoices: 'NPC Choices',
  combat: 'Combat',
  sounds: 'Sounds',
  portraits: 'Portraits',
  scripts: 'Scripts',
  randomisation: 'Randomisation',
  adjustments: 'Adjustments',
}

export const GAME_LABELS: Record<SelectedGame, string> = {
  bg1: 'BG:EE',
  bg2: 'BG2:EE',
  eet: 'EET',
  iwd: 'IWD:EE',
  pst: 'PST:EE',
}

/** Short code plus full product name (project hub, etc.). */
export const GAME_FULL_LABELS: Record<SelectedGame, string> = {
  bg1: "Baldur's Gate: Enhanced Edition",
  bg2: "Baldur's Gate II: Enhanced Edition",
  eet: 'Enhanced Edition Trilogy',
  iwd: 'Icewind Dale: Enhanced Edition',
  pst: 'Planescape Torment: Enhanced Edition',
}

export const STATION_TAG_SET = new Set<string>(STATION_ORDER)

export type NodeKind = 'component' | 'container' | 'alternatives' | 'station'

export interface NodeAttrs {
  id?: string
  /** WeiDU installer title (tp2/TRA); shown under component id in the detail sidebar. */
  name?: string
  /** Curated UI label; preferred as the detail sidebar title when present. */
  label?: string
  desc?: string
  /** Optional http(s) URL to component-specific documentation. */
  readme?: string
  modId?: string
  engine?: string
  /** Preset category token for mass-check tiles; inherited. */
  recommended?: string
  /** Optional sub-bundle under a recommended category; inherited. */
  package?: string
  /** Install impact tier: `minor`, `moderate`, or `major`. */
  complexity?: string
  required?: boolean
  noDisplay?: boolean
  /** When true, selected component is kept out of install-order export (UI-only marker). */
  noExport?: boolean
  alwaysIf?: string
  displayIf?: string
  displayIfNot?: string
  default?: boolean
  core?: boolean
  noBranches?: boolean
  tags?: string
  /** When true, the branch starts expanded in the UI despite default-folded tags. */
  unfolded?: boolean
  /** When true, children render in one horizontal row instead of a vertical list. */
  horizontal?: boolean
}

/** Shared fields for every tree node. */
export interface BaseNode {
  /** Stable unique key within the parsed tree (not the WeiDU component id). */
  key: string
  tag: string
  kind: NodeKind
  attrs: NodeAttrs
  /** Inherited effective engine allow-list string (comma tokens), empty = all games. */
  effectiveEngine: string
  effectiveRecommended?: string
  effectivePackage?: string
  children: TreeNode[]
  parentKey?: string
}

export interface ComponentNode extends BaseNode {
  kind: 'component'
  componentId: string
  /** Document order for install export. */
  orderIndex: number
}

export interface ContainerNode extends BaseNode {
  kind: 'container' | 'alternatives' | 'station'
}

export type TreeNode = ComponentNode | ContainerNode

export interface StationBlock {
  stationId: StationId
  /** All top-level station elements with this tag, in document order. */
  roots: ContainerNode[]
  /** UI children after folding matching sections across duplicate station roots. */
  children: TreeNode[]
}

export interface InstallSequenceModel {
  stations: StationBlock[]
  /** All components keyed by component id (last wins if duplicate ids). */
  componentsById: Map<string, ComponentNode>
  /** All components in document order. */
  componentsInOrder: ComponentNode[]
  /** Lookup any node by internal key. */
  nodesByKey: Map<string, TreeNode>
}

export function isStationTag(tag: string): tag is StationId {
  return STATION_TAG_SET.has(tag)
}

export function isComponentNode(node: TreeNode): node is ComponentNode {
  return node.kind === 'component'
}
