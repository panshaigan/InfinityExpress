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

export interface ComponentSelectionSummary {
  all: boolean
  some: boolean
}

export function summarizeComponentSelection(
  selected: ReadonlySet<string>,
  visibleComponents: readonly WeiduComponentInfo[],
): ComponentSelectionSummary {
  if (visibleComponents.length === 0) return { all: false, some: false }

  const ordinaryComponents = visibleComponents.filter(
    (component) => !normalized(component.subgroup ?? ''),
  )
  const subgroups = new Set(
    visibleComponents
      .map((component) => normalized(component.subgroup ?? ''))
      .filter(Boolean),
  )
  const ordinarySelected = ordinaryComponents.every((component) =>
    selected.has(componentBrowserKey(component)),
  )
  const everySubgroupSelected = [...subgroups].every((subgroup) =>
    visibleComponents.some(
      (component) =>
        normalized(component.subgroup ?? '') === subgroup &&
        selected.has(componentBrowserKey(component)),
    ),
  )

  return {
    all: ordinarySelected && everySubgroupSelected,
    some: visibleComponents.some((component) =>
      selected.has(componentBrowserKey(component)),
    ),
  }
}

export function setVisibleComponentsSelected(
  selected: ReadonlySet<string>,
  visibleComponents: readonly WeiduComponentInfo[],
  allComponents: readonly WeiduComponentInfo[],
  checked: boolean,
): Set<string> {
  const next = new Set(selected)
  if (!checked) {
    for (const component of visibleComponents) {
      next.delete(componentBrowserKey(component))
    }
    return next
  }

  const selectedSubgroups = new Set<string>()
  for (const component of visibleComponents) {
    const subgroup = normalized(component.subgroup ?? '')
    if (!subgroup) {
      next.add(componentBrowserKey(component))
      continue
    }
    if (selectedSubgroups.has(subgroup)) continue

    const selectedVisibleAlternative = visibleComponents.find(
      (candidate) =>
        normalized(candidate.subgroup ?? '') === subgroup &&
        next.has(componentBrowserKey(candidate)),
    )
    if (selectedVisibleAlternative) {
      selectedSubgroups.add(subgroup)
      continue
    }

    const selectedAlternative = allComponents.find(
      (candidate) =>
        normalized(candidate.subgroup ?? '') === subgroup &&
        next.has(componentBrowserKey(candidate)),
    )
    if (selectedAlternative) next.delete(componentBrowserKey(selectedAlternative))
    next.add(componentBrowserKey(component))
    selectedSubgroups.add(subgroup)
  }
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

export function findComponentByIdentity(
  components: readonly WeiduComponentInfo[],
  weiduId: string,
  requestedId: string,
): WeiduComponentInfo | undefined {
  const requested = normalized(requestedId)
  return components.find((component) =>
    componentIdentityCandidates(component, weiduId).some(
      (identity) => normalized(identity) === requested,
    ),
  )
}
