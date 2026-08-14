import { describe, expect, it } from 'vitest'
import { modTypeBadgeClass, modTypeBadgeLabel } from './modTypeBadge'

describe('modTypeBadgeLabel', () => {
  it('returns the complexity string as-is', () => {
    expect(modTypeBadgeLabel('major')).toBe('major')
    expect(modTypeBadgeLabel('moderate')).toBe('moderate')
  })
})

describe('modTypeBadgeClass', () => {
  it('maps known complexities to badge-mod-type-* classes', () => {
    expect(modTypeBadgeClass('major')).toBe(
      'badge badge-mod-type badge-mod-type-major',
    )
    expect(modTypeBadgeClass('Moderate')).toBe(
      'badge badge-mod-type badge-mod-type-moderate',
    )
    expect(modTypeBadgeClass(' minor ')).toBe(
      'badge badge-mod-type badge-mod-type-minor',
    )
  })

  it('falls back to unknown for unrecognized values', () => {
    expect(modTypeBadgeClass('medium')).toBe(
      'badge badge-mod-type badge-mod-type-unknown',
    )
    expect(modTypeBadgeClass('compilation')).toBe(
      'badge badge-mod-type badge-mod-type-unknown',
    )
    expect(modTypeBadgeClass('npc')).toBe(
      'badge badge-mod-type badge-mod-type-unknown',
    )
  })
})
