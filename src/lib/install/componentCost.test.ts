import { describe, expect, it } from 'vitest'
import {
  effectiveComponentCost,
  parseComponentCost,
  planEffectiveCosts,
} from './componentCost'

describe('parseComponentCost', () => {
  it('returns undefined for missing or invalid cost', () => {
    expect(parseComponentCost(undefined)).toBeUndefined()
    expect(parseComponentCost({})).toBeUndefined()
    expect(parseComponentCost({ cost: '  ' })).toBeUndefined()
    expect(parseComponentCost({ cost: '0' })).toBeUndefined()
    expect(parseComponentCost({ cost: '-1' })).toBeUndefined()
    expect(parseComponentCost({ cost: 'abc' })).toBeUndefined()
  })

  it('parses cost and optional costScale', () => {
    expect(parseComponentCost({ cost: '12' })).toEqual({ cost: 12 })
    expect(parseComponentCost({ cost: '12', costScale: '50' })).toEqual({
      cost: 12,
      costScale: 50,
    })
    expect(parseComponentCost({ cost: '12', costScale: '0' })).toEqual({
      cost: 12,
    })
  })
})

describe('effectiveComponentCost', () => {
  it('returns base cost when no scale', () => {
    expect(effectiveComponentCost({ cost: 10 }, 5000)).toBe(10)
  })

  it('adds scaled prior base sum', () => {
    // costScale 50 → +5% of prior: 50/1000 * 2000 = 100
    expect(effectiveComponentCost({ cost: 60, costScale: 50 }, 2000)).toBe(160)
  })
})

describe('planEffectiveCosts', () => {
  it('computes effective costs and plan max in order', () => {
    const componentsById = new Map([
      ['a', { attrs: { cost: '10' } }],
      ['b', { attrs: { cost: '20' } }],
      ['c', { attrs: { cost: '5', costScale: '100' } }], // +10% of prior
      ['d', { attrs: {} }],
    ])
    const steps = [
      { componentId: 'a' },
      { componentId: 'b' },
      { componentId: 'c' },
      { componentId: 'd' },
    ]
    const { effectiveCosts, planMax } = planEffectiveCosts(steps, componentsById)
    // c: priorBase = 10+20 = 30 → 5 + round(30*100/1000) = 5+3 = 8
    expect(effectiveCosts).toEqual([10, 20, 8, null])
    expect(planMax).toBe(20)
  })

  it('returns planMax 0 when no costs', () => {
    const { effectiveCosts, planMax } = planEffectiveCosts(
      [{ componentId: 'x' }],
      new Map([['x', { attrs: {} }]]),
    )
    expect(effectiveCosts).toEqual([null])
    expect(planMax).toBe(0)
  })
})
