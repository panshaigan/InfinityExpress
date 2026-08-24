import { describe, expect, it } from 'vitest'
import { gameFolderKeyForPhase, gameFolderKeyLabel, snapshotGameKeyForStep } from './gameFolderPrefs'

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

describe('snapshotGameKeyForStep', () => {
  const eet1 = { phase: 'eet1' as const }
  const eet = { phase: 'eet' as const }

  it('uses the previous step folder (first eet package → BG1)', () => {
    const steps = [eet1, eet1, eet, eet]
    expect(snapshotGameKeyForStep('eet', steps, 2)).toBe('bg1')
    expect(snapshotGameKeyForStep('eet', steps, 3)).toBe('bg2')
  })

  it('uses the current step when there is no previous', () => {
    expect(snapshotGameKeyForStep('eet', [eet1, eet], 0)).toBe('bg1')
  })
})

describe('gameFolderKeyLabel', () => {
  it('labels known keys', () => {
    expect(gameFolderKeyLabel('bg1')).toBe('BG1')
    expect(gameFolderKeyLabel('bg2')).toBe('BG2')
  })
})
