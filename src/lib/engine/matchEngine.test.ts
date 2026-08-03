import { describe, expect, it } from 'vitest'
import { engineMatches, parseEngineTokens } from '../engine/matchEngine'

describe('matchEngine', () => {
  it('parses tokens', () => {
    expect(parseEngineTokens('bg,eet')).toEqual(['bg', 'eet'])
  })

  it('bg covers bg1 and bg2 but not eet', () => {
    expect(engineMatches('bg', 'bg1')).toBe(true)
    expect(engineMatches('bg', 'bg2')).toBe(true)
    expect(engineMatches('bg', 'eet')).toBe(false)
  })

  it('bg,eet covers eet via eet token', () => {
    expect(engineMatches('bg,eet', 'eet')).toBe(true)
    expect(engineMatches('bg,eet', 'bg1')).toBe(true)
  })

  it('eet1 covers eet only', () => {
    expect(engineMatches('eet1', 'eet')).toBe(true)
    expect(engineMatches('eet1', 'bg1')).toBe(false)
  })

  it('empty engine matches all', () => {
    expect(engineMatches('', 'pst')).toBe(true)
    expect(engineMatches(undefined, 'iwd')).toBe(true)
  })
})
