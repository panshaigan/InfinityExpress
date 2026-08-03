import { describe, expect, it } from 'vitest'
import {
  collectConditionIds,
  collectConditionIdsFromExpr,
  evalConditionExpr,
  parseCondition,
} from '../selection/conditions'

describe('conditions', () => {
  it('parses AND and OR with parentheses', () => {
    const ast = parseCondition('ArtisansKitpack:20000,(xan:1|xan:3)')
    expect(ast.type).toBe('and')
  })

  it('evaluates AND/OR', () => {
    const selected = new Set(['ArtisansKitpack:20000', 'xan:3'])
    expect(evalConditionExpr('ArtisansKitpack:20000,(xan:1|xan:3)', selected)).toBe(true)
    expect(evalConditionExpr('ArtisansKitpack:20000,(xan:1|xan:3)', new Set(['xan:3']))).toBe(
      false,
    )
  })

  it('evaluates simple OR', () => {
    expect(evalConditionExpr('Tipun_iwd1_eet|iwd2_eet:0', new Set(['iwd2_eet:0']))).toBe(true)
  })

  it('collects ids from complex expressions', () => {
    const ast = parseCondition('ArtisansKitpack:20000,(xan:1|xan:3)')
    expect(collectConditionIds(ast)).toEqual(['ArtisansKitpack:20000', 'xan:1', 'xan:3'])
    expect(collectConditionIdsFromExpr('a|b,c')).toEqual(['a', 'b', 'c'])
    expect(collectConditionIdsFromExpr(undefined)).toEqual([])
    expect(collectConditionIdsFromExpr('((')).toEqual([])
  })
})
