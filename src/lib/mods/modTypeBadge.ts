const KNOWN_COMPLEXITIES = new Set(['major', 'moderate', 'minor'])

/** User-facing label for a component complexity value. */
export function modTypeBadgeLabel(complexity: string): string {
  return complexity
}

/**
 * CSS classes for a component complexity badge.
 * Known values get `badge-mod-type-*` variants; others fall back to unknown.
 */
export function modTypeBadgeClass(complexity: string): string {
  const key = complexity.trim().toLowerCase()
  const known = KNOWN_COMPLEXITIES.has(key) ? key : 'unknown'
  return `badge badge-mod-type badge-mod-type-${known}`
}
