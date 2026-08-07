const KNOWN_MOD_TYPES = new Set([
  'major',
  'medium',
  'minor',
  'compilation',
])

/** User-facing label for a mods.csv Type value. */
export function modTypeBadgeLabel(type: string): string {
  return type
}

/**
 * CSS classes for a mods.csv Type badge.
 * Known types get `badge-mod-type-*` variants; others fall back to unknown.
 */
export function modTypeBadgeClass(type: string): string {
  const key = type.trim().toLowerCase()
  const known = KNOWN_MOD_TYPES.has(key) ? key : 'unknown'
  return `badge badge-mod-type badge-mod-type-${known}`
}
