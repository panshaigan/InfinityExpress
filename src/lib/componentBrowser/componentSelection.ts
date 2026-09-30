import type { WeiduComponentInfo } from '../install/types'
import { componentIdentityCandidates } from './componentTag'

export function componentBrowserKey(
  component: Pick<WeiduComponentInfo, 'index' | 'number'>,
): string {
  return `${component.index}:${component.number}`
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function toggleComponentSelection(
  selected: ReadonlySet<string>,
  target: WeiduComponentInfo,
  components: readonly WeiduComponentInfo[],
): Set<string> {
  const next = new Set(selected)
  const targetKey = componentBrowserKey(target)
  const subgroup = normalized(target.subgroup ?? '')

  if (!subgroup) {
    if (next.has(targetKey)) next.delete(targetKey)
    else next.add(targetKey)
    return next
  }

  for (const component of components) {
    if (normalized(component.subgroup ?? '') === subgroup) {
      next.delete(componentBrowserKey(component))
    }
  }
  next.add(targetKey)
  return next
}

export function componentExistsInSequence(
  normalizedExistingIds: ReadonlySet<string>,
  component: Pick<WeiduComponentInfo, 'label' | 'number'>,
  weiduId: string,
): boolean {
  return componentIdentityCandidates(component, weiduId).some((id) =>
    normalizedExistingIds.has(normalized(id)),
  )
}

export function normalizeComponentIdentitySet(
  componentIds: ReadonlySet<string>,
): Set<string> {
  return new Set([...componentIds].map(normalized))
}
