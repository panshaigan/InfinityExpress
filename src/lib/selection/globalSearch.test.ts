import { describe, expect, it } from 'vitest'
import {
  componentTextMatchesSearch,
  normalizeSearchQuery,
  searchFieldsFromAttrs,
  searchRelevanceScore,
} from './componentSearch'
import {
  buildGlobalSearchResults,
  formatSearchPath,
} from './globalSearch'
import {
  createDefaultFilterCriteria,
  type FilterCriteria,
} from './filterDisplayTree'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import type { ModInfo } from '../mods/loadMods'

function criteria(partial: Partial<FilterCriteria> = {}): FilterCriteria {
  return { ...createDefaultFilterCriteria(), ...partial }
}

function mod(partial: Partial<ModInfo> & { codename: string; name: string }): ModInfo {
  return {
    abbreviation: '',
    category: '',
    url: '',
    readme: '',
    game: '',
    useMaster: false,
    useAssets: false,
    release: '',
    version: '',
    sizeBytes: null,
    author: '',
    type: '',
    stability: '',
    ...partial,
  }
}

describe('componentTextMatchesSearch', () => {
  it('matches id exactly, not as substring', () => {
    const fields = searchFieldsFromAttrs(
      { label: 'Alpha' },
      { componentId: 'mod:100' },
    )
    expect(componentTextMatchesSearch(fields, 'mod:100')).toBe(true)
    expect(componentTextMatchesSearch(fields, 'mod:10')).toBe(false)
    expect(componentTextMatchesSearch(fields, '100')).toBe(false)
  })

  it('matches label, weidu name, mod name, desc, ancestors as substring', () => {
    const fields = searchFieldsFromAttrs(
      {
        label: 'The Future is Now',
        name: 'WeiDU Title',
        desc: 'A long description about mirrors',
        modId: 'rod',
      },
      {
        componentId: 'rod:1',
        mod: mod({ codename: 'rod', name: 'Reflections of Destiny' }),
        ancestorLabels: ['Content', 'Quests'],
      },
    )
    const q = (s: string) => normalizeSearchQuery(s)
    expect(componentTextMatchesSearch(fields, q('future'))).toBe(true)
    expect(componentTextMatchesSearch(fields, q('weidu'))).toBe(true)
    expect(componentTextMatchesSearch(fields, q('destiny'))).toBe(true)
    expect(componentTextMatchesSearch(fields, q('mirrors'))).toBe(true)
    expect(componentTextMatchesSearch(fields, q('quests'))).toBe(true)
  })

  it('ranks exact id above label and ancestor-only hits', () => {
    const idHit = searchFieldsFromAttrs({ label: 'Other' }, { componentId: 'abc' })
    const labelHit = searchFieldsFromAttrs({ label: 'abc widget' }, { componentId: 'x' })
    const ancestorHit = searchFieldsFromAttrs(
      { label: 'Leaf' },
      { componentId: 'y', ancestorLabels: ['abc folder'] },
    )
    expect(searchRelevanceScore(idHit, 'abc')).toBeGreaterThan(
      searchRelevanceScore(labelHit, 'abc'),
    )
    expect(searchRelevanceScore(labelHit, 'abc')).toBeGreaterThan(
      searchRelevanceScore(ancestorHit, 'abc'),
    )
  })
})

describe('buildGlobalSearchResults', () => {
  const xml = `<?xml version="1.0"?>
<installSequence>
  <base>
    <component id="base:1" label="Base Fix" />
    <component id="base:hidden" label="Hidden Base" noDisplay="true" />
    <component id="base:export" label="No Export" noExport="true" />
  </base>
  <content>
    <bg1 label="Baldur's Gate">
      <quests label="Quests">
        <mod id="quest-mod" label="Quest Mod">
          <component id="quest:1" label="Main Quest" name="WeiDU Quest" />
          <component id="quest:gated" label="Gated Quest" displayIf="quest:1" />
        </mod>
      </quests>
    </bg1>
    <bg2 label="Shadows of Amn">
      <quests label="Quests">
        <component id="bg2:1" label="SoA Only" engine="bg2" />
      </quests>
    </bg2>
  </content>
  <mechanics>
    <component id="mech:1" label="Tweak" />
  </mechanics>
</installSequence>`

  const { model } = parseInstallSequence(xml)
  const modsByCodename = new Map([
    [
      'quest-mod',
      mod({ codename: 'quest-mod', name: 'Amazing Quest Pack' }),
    ],
  ])
  const modCtx = { model, modsByCodename }
  const seed = {}

  it('excludes noExport and engine-mismatched components', () => {
    const hits = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(),
      criteria(),
      modCtx,
      seed,
    )
    const ids = hits.map((h) => h.component.componentId)
    expect(ids).toContain('base:1')
    expect(ids).toContain('base:hidden')
    expect(ids).toContain('quest:1')
    expect(ids).toContain('quest:gated')
    expect(ids).toContain('mech:1')
    expect(ids).not.toContain('base:export')
    expect(ids).not.toContain('bg2:1')
  })

  it('always lists hidden; gated is listed but not checkable', () => {
    const hits = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(),
      criteria({ showHidden: false }),
      modCtx,
      seed,
    )
    const hidden = hits.find((h) => h.component.componentId === 'base:hidden')
    expect(hidden).toBeTruthy()
    expect(hidden!.eligible).toBe(true)

    const gated = hits.find((h) => h.component.componentId === 'quest:gated')
    expect(gated).toBeTruthy()
    expect(gated!.eligible).toBe(false)
    expect(gated!.checkable).toBe(false)

    const unlocked = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(['quest:1']),
      criteria(),
      modCtx,
      seed,
    )
    const gatedOn = unlocked.find((h) => h.component.componentId === 'quest:gated')
    expect(gatedOn!.eligible).toBe(true)
  })

  it('builds Content paths with main and subbranch', () => {
    const hits = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(),
      criteria({ search: 'Main Quest' }),
      modCtx,
      seed,
    )
    expect(hits).toHaveLength(1)
    expect(formatSearchPath(hits[0]!.pathLabels)).toBe(
      "Content › Baldur's Gate › Quests › Quest Mod",
    )
  })

  it('matches exact component id and ranks it first', () => {
    const hits = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(),
      criteria({ search: 'quest:1' }),
      modCtx,
      seed,
    )
    expect(hits[0]!.component.componentId).toBe('quest:1')
  })

  it('matches ancestor path labels and mod catalog name', () => {
    const byPath = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(),
      criteria({ search: "Baldur's Gate" }),
      modCtx,
      seed,
    )
    expect(byPath.map((h) => h.component.componentId)).toEqual(
      expect.arrayContaining(['quest:1', 'quest:gated']),
    )

    const byModName = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(),
      criteria({ search: 'Amazing Quest' }),
      modCtx,
      seed,
    )
    expect(byModName.map((h) => h.component.componentId)).toContain('quest:1')
  })

  it('empty query returns document order across stations', () => {
    const hits = buildGlobalSearchResults(
      model,
      'bg1',
      new Set(),
      criteria(),
      modCtx,
      seed,
    )
    const ids = hits.map((h) => h.component.componentId)
    expect(ids.indexOf('base:1')).toBeLessThan(ids.indexOf('quest:1'))
    expect(ids.indexOf('quest:1')).toBeLessThan(ids.indexOf('mech:1'))
  })
})
