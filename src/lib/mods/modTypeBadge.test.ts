import { describe, expect, it } from 'vitest'
import { modTypeBadgeClass, modTypeBadgeLabel } from './modTypeBadge'

describe('modTypeBadgeLabel', () => {
  it('returns the type string as-is', () => {
    expect(modTypeBadgeLabel('major')).toBe('major')
    expect(modTypeBadgeLabel('compilation')).toBe('compilation')
  })
})

describe('modTypeBadgeClass', () => {
  it('maps known types to badge-mod-type-* classes', () => {
    expect(modTypeBadgeClass('major')).toBe(
      'badge badge-mod-type badge-mod-type-major',
    )
    expect(modTypeBadgeClass('Medium')).toBe(
      'badge badge-mod-type badge-mod-type-medium',
    )
    expect(modTypeBadgeClass(' minor ')).toBe(
      'badge badge-mod-type badge-mod-type-minor',
    )
    expect(modTypeBadgeClass('compilation')).toBe(
      'badge badge-mod-type badge-mod-type-compilation',
    )
  })

  it('falls back to unknown for unrecognized types', () => {
    expect(modTypeBadgeClass('npc')).toBe(
      'badge badge-mod-type badge-mod-type-unknown',
    )
  })
})
