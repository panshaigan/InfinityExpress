import { describe, expect, it } from 'vitest'
import {
  analyzeConditionExpression,
  conditionIdentifierRange,
  filterConditionOptions,
  insertConditionOperator,
  mergeConditionComponentOptions,
  replaceConditionIdentifier,
  type ConditionComponentOption,
} from './conditionEditor'

const options: ConditionComponentOption[] = [
  { id: 'gate:1', label: 'Main gate', name: 'Install gate', modId: 'gate' },
  { id: 'other', label: 'Other feature', name: 'Other', modId: 'example' },
  {
    id: 'tweaks!spell:2',
    label: 'Arcane spell fixes',
    name: 'Spell tweaks',
    modId: 'tweaks',
  },
]

describe('condition expression editor', () => {
  it('finds and replaces the identifier around the caret', () => {
    expect(conditionIdentifierRange('gate:1|oth', 10)).toEqual({
      start: 7,
      end: 10,
      query: 'oth',
    })
    expect(replaceConditionIdentifier('gate:1|oth', 10, 'other')).toEqual({
      value: 'gate:1|other',
      caret: 12,
    })
    expect(conditionIdentifierRange('gate:1|arcane spell', 19)).toEqual({
      start: 7,
      end: 19,
      query: 'arcane spell',
    })
    expect(replaceConditionIdentifier('gate:1|arcane spell', 19, 'tweaks!spell:2')).toEqual({
      value: 'gate:1|tweaks!spell:2',
      caret: 21,
    })
  })

  it('inserts operators at the active selection', () => {
    expect(insertConditionOperator('gateother', 4, 9, '|')).toEqual({
      value: 'gate|',
      caret: 5,
    })
  })

  it('searches ids and descriptive metadata while ranking id prefixes first', () => {
    expect(filterConditionOptions(options, 'oth').map((option) => option.id)).toEqual([
      'other',
    ])
    expect(filterConditionOptions(options, 'gate').map((option) => option.id)).toEqual([
      'gate:1',
    ])
    expect(
      filterConditionOptions(options, 'spell arcane').map((option) => option.id),
    ).toEqual(['tweaks!spell:2'])
    expect(filterConditionOptions(options, 'spell missing')).toEqual([])
  })

  it('merges browsed components into XML options while keeping XML metadata', () => {
    expect(
      mergeConditionComponentOptions(options, [
        { id: 'GATE:1', label: 'Browsed gate', name: 'Gate', modId: 'gate' },
        { id: 'new:2', label: 'New component', name: 'New', modId: 'new' },
      ]),
    ).toEqual([
      ...options,
      { id: 'new:2', label: 'New component', name: 'New', modId: 'new' },
    ])
  })

  it('validates syntax and reports previews, unknown ids, and self references', () => {
    expect(
      analyzeConditionExpression(
        'gate:1,(other|missing)',
        new Set(['gate:1', 'other']),
        'other',
      ),
    ).toEqual({
      error: null,
      preview: 'gate:1 AND (other OR missing)',
      unknownIds: ['missing'],
      selfReference: true,
    })
    expect(analyzeConditionExpression('gate:1,(', new Set(), 'self').error).toMatch(
      /Expected/,
    )
    expect(
      analyzeConditionExpression(
        'tweaks!spell:2',
        new Set(['tweaks!spell:2']),
        'other',
      ).error,
    ).toBeNull()
  })
})
