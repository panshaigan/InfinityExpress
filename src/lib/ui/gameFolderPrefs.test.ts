import { describe, expect, it } from 'vitest'
import { gameFolderKeyForPhase, gameFolderKeyLabel } from './gameFolderPrefs'

describe('gameFolderKeyForPhase', () => {
  it('maps EET eet1 to bg1 and eet to bg2', () => {
    expect(gameFolderKeyForPhase('eet', 'eet1')).toBe('bg1')
    expect(gameFolderKeyForPhase('eet', 'eet')).toBe('bg2')
  })

  it('maps single-phase games to themselves', () => {
    expect(gameFolderKeyForPhase('bg2', 'single')).toBe('bg2')
    expect(gameFolderKeyForPhase('bg1', 'single')).toBe('bg1')
    expect(gameFolderKeyForPhase('iwd', 'single')).toBe('iwd')
    expect(gameFolderKeyForPhase('pst', 'single')).toBe('pst')
  })
})

describe('gameFolderKeyLabel', () => {
  it('labels known keys', () => {
    expect(gameFolderKeyLabel('bg1')).toBe('BG1')
    expect(gameFolderKeyLabel('bg2')).toBe('BG2')
  })
})
