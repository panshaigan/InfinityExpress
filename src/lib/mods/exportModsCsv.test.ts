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
    track: '',
    download: '',
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
    const csv = serializeModsCsv(
      [
        mod({
          codename: 'Zed',
          overlays: { version: 'v9', sizeBytes: 99 },
        }),
        mod({ codename: 'Aye', track: 'main' }),
      ],
      ['Aye', 'Zed'],
    )
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe(MODS_CSV_HEADER)
    expect(lines[1]).toContain('Aye')
    expect(lines[1]).toMatch(/,main,,/)
    expect(lines[2]).toContain('v9')
    expect(lines[2]).toContain(',99,')
  })

  it('follows base order instead of alphabetical codename order', () => {
    const csv = serializeModsCsv(
      [mod({ codename: 'Aye' }), mod({ codename: 'Zed' })],
      ['Zed', 'Aye'],
    )
    const lines = csv.trimEnd().split('\n')
    expect(lines[1]).toContain('Zed')
    expect(lines[2]).toContain('Aye')
  })

  it('appends mods not in base order at the end', () => {
    const csv = serializeModsCsv(
      [
        mod({ codename: 'NewUser', origin: 'user' }),
        mod({ codename: 'Aye' }),
        mod({ codename: 'Zed' }),
      ],
      ['Zed', 'Aye'],
    )
    const lines = csv.trimEnd().split('\n')
    expect(lines[1]).toContain('Zed')
    expect(lines[2]).toContain('Aye')
    expect(lines[3]).toContain('NewUser')
  })
})
