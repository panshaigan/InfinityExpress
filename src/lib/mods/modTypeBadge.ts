/** User-facing label for a mods.csv Type value. */
export function modTypeBadgeLabel(type: string): string {
  return type
}

/**
 * CSS classes for a mod Type badge.
 * Generic today; extend with `badge-mod-type-*` variants when recoloring badges.
 */
export function modTypeBadgeClass(type: string): string {
  void type
  return 'badge'
}
