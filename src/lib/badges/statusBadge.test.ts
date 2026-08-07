import { describe, expect, it } from 'vitest'
import { statusBadgeClass } from './statusBadge'

describe('statusBadgeClass', () => {
  it('maps status kinds to badge-status-* classes', () => {
    expect(statusBadgeClass('required')).toBe(
      'badge badge-status badge-status-required',
    )
    expect(statusBadgeClass('chooseOne')).toBe(
      'badge badge-status badge-status-chooseOne',
    )
    expect(statusBadgeClass('core')).toBe('badge badge-status badge-status-core')
    expect(statusBadgeClass('default')).toBe(
      'badge badge-status badge-status-default',
    )
    expect(statusBadgeClass('hidden')).toBe(
      'badge badge-status badge-status-hidden',
    )
  })

  it('maps tags to the quiet badge-tag class', () => {
    expect(statusBadgeClass('tag')).toBe('badge badge-tag')
  })
})
