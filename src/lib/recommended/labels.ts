import {
  isStationTag,
  STATION_LABELS,
  type InstallSequenceModel,
} from '../xml/schema'

export function recommendedLabel(token: string): string {
  if (isStationTag(token)) return STATION_LABELS[token]
  return token
}

/** Label from the nearest ancestor that declares this package token. */
export function packageLabel(
  model: InstallSequenceModel,
  packageToken: string,
): string {
  for (const node of model.nodesByKey.values()) {
    if (node.attrs.package === packageToken) {
      const label = node.attrs.label?.trim()
      if (label) return label
    }
  }
  return packageToken
}
