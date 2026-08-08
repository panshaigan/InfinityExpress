import { describe, expect, it } from 'vitest'
import {
  acquireButtonKind,
  acquireButtonLabel,
  estimateAcquireTotal,
  modsNeedingAcquire,
} from './acquireTargets'
import type { WorkingMod } from './loadMods'

function mod(
  partial: Partial<WorkingMod> & { codename: string },
): WorkingMod {
  return {
    name: partial.codename,
    abbreviation: '',
    category: '',
    url: '',
    readme: '',
    game: '',
    useMaster: false,
    useAssets: false,
    release: '',
    version: 'v1',
    sizeBytes: 100,
    author: '',
    type: '',
    stability: '',
    origin: 'base',
    diskStatus: 'not_present',
    overlays: {},
    ...partial,
  }
}

describe('modsNeedingAcquire', () => {
  it('keeps only not_present and update_available', () => {
    const mods = [
      mod({ codename: 'a', diskStatus: 'not_present' }),
      mod({ codename: 'b', diskStatus: 'present' }),
      mod({ codename: 'c', diskStatus: 'update_available' }),
    ]
    expect(modsNeedingAcquire(mods, ['a', 'b', 'c']).map((m) => m.codename)).toEqual([
      'a',
      'c',
    ])
  })
})

describe('acquireButtonKind', () => {
  it('picks smart labels', () => {
    expect(acquireButtonKind(['not_present'])).toBe('download')
    expect(acquireButtonKind(['update_available'])).toBe('update')
    expect(
      acquireButtonKind(['not_present', 'update_available']),
    ).toBe('download_and_update')
    expect(acquireButtonKind(['present'])).toBe('none')
    expect(acquireButtonLabel('download_and_update')).toBe('Download & Update')
  })
})

describe('estimateAcquireTotal', () => {
  it('uses pending size then catalog estimate', () => {
    const targets = [
      mod({ codename: 'a', sizeBytes: 50 }),
      mod({ codename: 'b', sizeBytes: 200 }),
      mod({ codename: 'c', sizeBytes: null }),
    ]
    const pending = new Map([
      [
        'a',
        {
          version: 'v2',
          release: '',
          downloadUrl: null,
          extension: null,
          strategy: 'x',
          sizeBytes: 80,
          sizeIsEstimate: false,
        },
      ],
    ])
    const result = estimateAcquireTotal({ targets, pending })
    expect(result.totalBytes).toBe(280)
    expect(result.knownCount).toBe(1)
    expect(result.estimateCount).toBe(1)
    expect(result.unknownCount).toBe(1)
  })
})
