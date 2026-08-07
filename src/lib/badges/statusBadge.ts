export type StatusBadgeKind =
  | 'required'
  | 'hidden'
  | 'core'
  | 'default'
  | 'chooseOne'
  | 'tag'

/** CSS classes for structural / attribute / freeform-tag badges. */
export function statusBadgeClass(kind: StatusBadgeKind): string {
  if (kind === 'tag') return 'badge badge-tag'
  return `badge badge-status badge-status-${kind}`
}
