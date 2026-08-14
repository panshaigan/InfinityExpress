import { describe, expect, it } from 'vitest'
import { toggleLadderLevel, type LadderLevel } from './levels'

describe('toggleLadderLevel', () => {
  it('checking vanillaPlus from empty adds only vanillaPlus', () => {
    const next = toggleLadderLevel(new Set(), 'vanillaPlus', true)
    expect(next).toEqual(new Set<LadderLevel>(['vanillaPlus']))
  })

  it('checking vanillaPlus when fixes is checked keeps fixes without adding restoration', () => {
    const next = toggleLadderLevel(new Set(['fixes']), 'vanillaPlus', true)
    expect(next).toEqual(new Set<LadderLevel>(['fixes', 'vanillaPlus']))
  })

  it('unchecking restoration removes only that rank', () => {
    const next = toggleLadderLevel(
      new Set(['fixes', 'restoration', 'vanillaPlus']),
      'restoration',
      false,
    )
    expect(next).toEqual(new Set<LadderLevel>(['fixes', 'vanillaPlus']))
  })
})
