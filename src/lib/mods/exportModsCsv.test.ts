import { describe, expect, it } from 'vitest'
import { serializeModsCsv, MODS_CSV_HEADER } from './exportModsCsv'
import type { WorkingMod } from './loadMods'

function mod(partial: Partial<WorkingMod> & { codename: string }): WorkingMod {
  return {
    name: partial.name ?? partial.codename,
    abbreviation: '',
    category: 'NPC',
    url: 'https://example.com/m',
    readme: '',
    game: 'BG2',
    useMaster: false,
    useAssets: false,
    release: '2020-01-01',
    version: 'v1',
    sizeBytes: 10,
    author: 'A',
    type: 'minor',
    stability: '',
    origin: 'base',
    diskStatus: 'present',
    overlays: {},
    ...partial,
  }
}

describe('serializeModsCsv', () => {
  it('writes full header and overlay version', () => {
    const csv = serializeModsCsv([
      mod({
        codename: 'Zed',
        overlays: { version: 'v9', sizeBytes: 99 },
      }),
      mod({ codename: 'Aye', useMaster: true }),
    ])
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe(MODS_CSV_HEADER)
    expect(lines[1]).toContain('Aye')
    expect(lines[1]).toMatch(/,1,,/)
    expect(lines[2]).toContain('v9')
    expect(lines[2]).toContain(',99,')
  })
})
