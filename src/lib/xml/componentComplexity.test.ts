import { describe, expect, it } from 'vitest'
import { resolveComponentComplexity } from './componentComplexity'

describe('resolveComponentComplexity', () => {
  it('returns trimmed complexity from component attrs', () => {
    expect(
      resolveComponentComplexity({ attrs: { complexity: ' major ' } }),
    ).toBe('major')
    expect(
      resolveComponentComplexity({ attrs: { complexity: 'moderate' } }),
    ).toBe('moderate')
  })

  it('returns undefined when missing or blank', () => {
    expect(resolveComponentComplexity(undefined)).toBeUndefined()
    expect(resolveComponentComplexity({ attrs: {} })).toBeUndefined()
    expect(resolveComponentComplexity({ attrs: { complexity: '  ' } })).toBeUndefined()
  })
})
