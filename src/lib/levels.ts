/** Known install-sequence level tokens and short UI labels. */
export const LEVEL_LABELS: Record<string, string> = {
  fixes: 'fixes',
  vanillaPlus: 'vanilla+',
  restoration: 'restoration',
  restructure: 'restructure',
  blendWell: 'blend well',
  quality: 'quality',
  difficulty: 'difficulty',
}

export function levelBadgeLabel(level: string): string {
  return LEVEL_LABELS[level] ?? level
}

export function levelBadgeClass(level: string): string {
  const known = level in LEVEL_LABELS ? level : 'unknown'
  return `badge badge-level badge-level-${known}`
}
