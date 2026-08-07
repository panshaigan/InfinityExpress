import { describe, expect, it } from 'vitest'
import {
  componentTextMatchesSearch,
  normalizeSearchQuery,
  searchRelevanceScore,
} from './componentSearch'

describe('normalizeSearchQuery', () => {
  it('trims and lowercases', () => {
    expect(normalizeSearchQuery('  AbC  ')).toBe('abc')
  })
})

describe('componentTextMatchesSearch exact id', () => {
  it('requires full id equality', () => {
    expect(
      componentTextMatchesSearch(
        { label: 'X', componentId: 'pack:12' },
        'pack:12',
      ),
    ).toBe(true)
    expect(
      componentTextMatchesSearch(
        { label: 'X', componentId: 'pack:12' },
        'pack',
      ),
    ).toBe(false)
  })
})

describe('searchRelevanceScore', () => {
  it('returns 0 for empty query', () => {
    expect(searchRelevanceScore({ label: 'Anything' }, '')).toBe(0)
  })
})
