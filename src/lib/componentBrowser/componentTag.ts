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

export function validateComponentTagDraft(draft: ComponentTagDraft): string | null {
  if (!draft.id.trim()) return 'ID is required'
  if (!draft.name.trim()) return 'Name is required'
  if (!draft.label.trim()) return 'Label is required'
  if (!draft.modId.trim()) return 'Mod download ID is required'
  return null
}

export function serializeComponentTag(draft: ComponentTagDraft): string {
  const error = validateComponentTagDraft(draft)
  if (error) throw new Error(error)

  const attrs: Array<[string, string]> = [
    ['id', draft.id.trim()],
    ['name', draft.name.trim()],
    ['label', draft.label.trim()],
  ]
  if (draft.core) attrs.push(['core', '1'])
  attrs.push(['modId', draft.modId.trim()])
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
