import type { EngineToken } from '../xml/schema'
import type { WeiduComponentInfo } from '../install/types'

export const COMPONENT_ENGINE_TOKENS: readonly EngineToken[] = [
  'bg',
  'bg1',
  'bg2',
  'eet',
  'eet1',
  'iwd',
  'pst',
]

export const COMPONENT_COMPLEXITIES = ['minor', 'moderate', 'major'] as const

export interface ComponentTagDraft {
  id: string
  name: string
  label: string
  core: boolean
  modId: string
  engine: EngineToken[]
  recommended: string
  complexity: string
  default: boolean
}

export function componentXmlId(
  component: Pick<WeiduComponentInfo, 'label' | 'number'>,
  weiduId: string,
): string {
  const label = component.label.find((value) => value.trim())?.trim()
  return label || `${weiduId.trim()}:${component.number}`
}

export function componentIdentityCandidates(
  component: Pick<WeiduComponentInfo, 'label' | 'number'>,
  weiduId: string,
): string[] {
  const identities = component.label.map((value) => value.trim()).filter(Boolean)
  identities.push(`${weiduId.trim()}:${component.number}`)
  return [...new Set(identities)]
}

export function createComponentTagDraft(
  component: WeiduComponentInfo,
  weiduId: string,
  modId: string,
): ComponentTagDraft {
  return {
    id: componentXmlId(component, weiduId),
    name: component.name.trim(),
    label: component.name.trim(),
    core: false,
    modId: modId.trim(),
    engine: [],
    recommended: '',
    complexity: '',
    default: false,
  }
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function validateComponentTagDraft(
  draft: ComponentTagDraft,
  options: { omitModId?: boolean } = {},
): string | null {
  if (!draft.id.trim()) return 'ID is required'
  if (!draft.name.trim()) return 'Name is required'
  if (!draft.label.trim()) return 'Label is required'
  if (!options.omitModId && !draft.modId.trim()) return 'Mod download ID is required'
  return null
}

export function serializeComponentTag(
  draft: ComponentTagDraft,
  options: { omitModId?: boolean } = {},
): string {
  const error = validateComponentTagDraft(draft, options)
  if (error) throw new Error(error)

  const attrs: Array<[string, string]> = [
    ['id', draft.id.trim()],
    ['name', draft.name.trim()],
    ['label', draft.label.trim()],
  ]
  if (draft.core) attrs.push(['core', '1'])
  if (!options.omitModId) attrs.push(['modId', draft.modId.trim()])
  if (draft.engine.length > 0) {
    const selected = new Set(draft.engine)
    attrs.push([
      'engine',
      COMPONENT_ENGINE_TOKENS.filter((token) => selected.has(token)).join(','),
    ])
  }
  if (draft.recommended.trim()) {
    attrs.push(['recommended', draft.recommended.trim()])
  }
  if (draft.complexity.trim()) {
    attrs.push(['complexity', draft.complexity.trim()])
  }
  if (draft.default) attrs.push(['default', '1'])

  return `<component ${attrs
    .map(([key, value]) => `${key}="${escapeXmlAttribute(value)}"`)
    .join(' ')} />`
}

export function serializeModComponentBlock(
  modId: string,
  drafts: readonly ComponentTagDraft[],
): string {
  const cleanModId = modId.trim()
  if (!cleanModId) throw new Error('Mod download ID is required')
  if (drafts.length === 0) throw new Error('Select at least one component')

  const components = drafts.map(
    (draft) =>
      `  ${serializeComponentTag({ ...draft, modId: cleanModId }, { omitModId: true })}`,
  )
  return [`<mod id="${escapeXmlAttribute(cleanModId)}">`, ...components, '</mod>'].join(
    '\n',
  )
}

export function serializeAlternativesBlock(
  label: string,
  drafts: readonly ComponentTagDraft[],
): string {
  const cleanLabel = label.trim()
  if (!cleanLabel) throw new Error('Alternatives label is required')
  if (drafts.length === 0) throw new Error('No alternative components found')

  const components = drafts.map(
    (draft) => `  ${serializeComponentTag(draft, { omitModId: true })}`,
  )
  return [
    `<alternatives label="${escapeXmlAttribute(cleanLabel)}">`,
    ...components,
    '</alternatives>',
  ].join('\n')
}

export function applySelectedAlternativeDefault(
  drafts: readonly ComponentTagDraft[],
  selectedIndex: number,
): ComponentTagDraft[] {
  if (selectedIndex < 0 || selectedIndex >= drafts.length) return [...drafts]
  return drafts.map((draft, index) => ({
    ...draft,
    default: index === selectedIndex,
  }))
}
