import { describe, expect, it } from 'vitest'
import {
  applySelectionPreset,
  autoPresetName,
  fingerprintFromLive,
  fingerprintFromPreset,
  payloadFromLive,
  presetsForGame,
  snapshotSelectionPreset,
  uniquePresetName,
} from './selectionPresets'

describe('uniquePresetName', () => {
  it('returns trimmed name when unused', () => {
    expect(uniquePresetName('  My build  ', ['Other'])).toBe('My build')
  })

  it('falls back to Preset when blank', () => {
    expect(uniquePresetName('   ', [])).toBe('Preset')
  })

  it('appends (2), (3) for duplicates', () => {
    expect(uniquePresetName('My build', ['My build'])).toBe('My build (2)')
    expect(uniquePresetName('My build', ['My build', 'My build (2)'])).toBe('My build (3)')
  })
})

describe('autoPresetName', () => {
  it('includes game label, count, and time', () => {
    const name = autoPresetName('bg2', 128, new Date(2026, 7, 7, 14, 32, 0))
    expect(name).toBe('BG2:EE · 128 comps · 14:32')
  })
})

describe('presetsForGame', () => {
  it('filters by game', () => {
    const presets = [
      snapshotSelectionPreset('a', 'A', {
        game: 'bg2',
        selectedIds: new Set(['x']),
        ladderChecked: new Set(),
        lowerDifficulty: false,
        higherDifficulty: false,
        lastGlobalLadder: new Set(),
        lastGlobalLowerDifficulty: false,
        lastGlobalHigherDifficulty: false,
        stationLevelPresets: new Map(),
        recommendedChecked: new Set(),
        packagesChecked: new Set(),
      }),
      snapshotSelectionPreset('b', 'B', {
        game: 'eet',
        selectedIds: new Set(['y']),
        ladderChecked: new Set(),
        lowerDifficulty: false,
        higherDifficulty: false,
        lastGlobalLadder: new Set(),
        lastGlobalLowerDifficulty: false,
        lastGlobalHigherDifficulty: false,
        stationLevelPresets: new Map(),
        recommendedChecked: new Set(),
        packagesChecked: new Set(),
      }),
    ]
    expect(presetsForGame(presets, 'bg2').map((p) => p.id)).toEqual(['a'])
  })
})

describe('snapshot round-trip', () => {
  it('serializes Sets/Maps and restores equivalent live state', () => {
    const live = {
      game: 'bg1' as const,
      selectedIds: new Set(['b:2', 'a:1']),
      ladderChecked: new Set(['fixes', 'extended'] as const),
      lowerDifficulty: true,
      higherDifficulty: false,
      lastGlobalLadder: new Set(['fixes'] as const),
      lastGlobalLowerDifficulty: true,
      lastGlobalHigherDifficulty: false,
      stationLevelPresets: new Map([
        [
          'content',
          {
            ladder: new Set(['restoration'] as const),
            lowerDifficulty: false,
            higherDifficulty: true,
          },
        ],
      ]),
      recommendedChecked: new Set(['sounds']),
      packagesChecked: new Set(['vve']),
    }

    const preset = snapshotSelectionPreset('id-1', 'Test', live)
    expect(preset.selectedIds).toEqual(['a:1', 'b:2'])
    expect(preset.ladderChecked).toEqual(['fixes', 'extended'])
    expect(preset.stationLevelPresets.content).toEqual({
      ladder: ['restoration'],
      lowerDifficulty: false,
      higherDifficulty: true,
    })
    expect(preset.recommendedChecked).toEqual(['sounds'])
    expect(preset.packagesChecked).toEqual(['vve'])

    const applied = applySelectionPreset(preset)
    expect([...applied.selectedIds].sort()).toEqual(['a:1', 'b:2'])
    expect(applied.lowerDifficulty).toBe(true)
    expect(applied.stationLevelPresets.get('content')?.higherDifficulty).toBe(true)
    expect([...applied.stationLevelPresets.get('content')!.ladder]).toEqual(['restoration'])

    expect(fingerprintFromLive(live)).toBe(fingerprintFromPreset(preset))
    expect(payloadFromLive(live).game).toBe('bg1')
  })
})
