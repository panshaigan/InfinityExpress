import { describe, expect, it } from 'vitest'
import type { PresetGroup } from '../../data/presetCatalog'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { buildRecommendedCatalog } from './catalog'
import {
  applyPresetGroupToCheckedSets,
  resolvePresetGroups,
} from './presetGroups'

const XML = `<?xml version="1.0"?>
<installSequence>
  <ui recommended="ui">
    <component id="ui:0" label="UI" engine="bg,eet" />
    <component id="eeex:1" label="EEex" package="EEex" engine="bg,eet" />
  </ui>
  <gfx>
    <mod id="BGGO" label="Baldur's Gate Graphical Overhaul" recommended="gfx" package="BGGO" engine="bg,eet">
      <component id="bggo:0" label="BGGO core" />
    </mod>
  </gfx>
  <content>
    <group label="Fixes" recommended="fixes">
      <component id="fix:0" label="Fix" engine="bg,eet" />
    </group>
    <npc recommended="npc">
      <component id="npc:base" label="NPC tweak" engine="bg,eet" />
      <expansions label="Original Cast Expansions" package="npcExpansions">
        <component id="npc:exp" label="Expansion" />
      </expansions>
      <romances label="Romances" package="romances">
        <component id="npc:rom" label="Romance" />
      </romances>
    </npc>
    <group label="Higher" recommended="higherDifficulty">
      <component id="hd:0" label="Harder" engine="bg,eet" />
      <mod id="scs" label="Encounters" package="encounters" engine="bg,eet">
        <component id="scs:0" label="Tactics" />
      </mod>
      <component id="strict:0" label="Strict ID" package="strictIdentification" engine="bg,eet" />
    </group>
    <group label="Lower" recommended="lowerDifficulty">
      <component id="easy:0" label="Easier" engine="bg,eet" />
      <component id="notraps:0" label="No traps" package="disableTraps" engine="bg,eet" />
    </group>
    <group label="IWD" recommended="iwd">
      <component id="iwd:0" label="IWD" engine="eet" />
    </group>
  </content>
</installSequence>`

const GROUPS: PresetGroup[] = [
  {
    id: 'allRecommended',
    label: 'All recommended',
    include: ['fixes', { token: 'ui', packages: true }, { token: 'gfx', packages: true }],
  },
  {
    id: 'npc',
    label: 'NPC',
    include: [{ token: 'npc', packages: 'only' }],
  },
  {
    id: 'lowerDifficulty',
    label: 'Lower difficulty',
    include: ['lowerDifficulty'],
  },
  {
    id: 'higherDifficulty',
    label: 'Higher difficulty',
    include: ['higherDifficulty', { package: 'encounters' }],
  },
  {
    id: 'empty',
    label: 'Missing',
    include: ['dedicated'],
  },
]

describe('resolvePresetGroups', () => {
  const { model } = parseInstallSequence(XML)
  const catalog = buildRecommendedCatalog(model, 'eet')

  it('expands recommended tiles, nested packages, packages-only, and explicit packages', () => {
    const resolved = resolvePresetGroups(GROUPS, catalog, model, new Set(), new Set())
    const byId = Object.fromEntries(resolved.map((g) => [g.id, g]))

    expect(byId.allRecommended?.members.map((m) => `${m.kind}:${m.token}`)).toEqual([
      'recommended:fixes',
      'recommended:ui',
      'package:EEex',
      'package:BGGO',
    ])
    expect(byId.npc?.members.map((m) => `${m.kind}:${m.token}`)).toEqual([
      'package:npcExpansions',
      'package:romances',
    ])
    expect(byId.lowerDifficulty?.members.map((m) => `${m.kind}:${m.token}`)).toEqual([
      'recommended:lowerDifficulty',
    ])
    expect(byId.higherDifficulty?.members.map((m) => `${m.kind}:${m.token}`)).toEqual([
      'recommended:higherDifficulty',
      'package:encounters',
    ])
    expect(byId.empty).toBeUndefined()
  })

  it('omits engine-ineligible tiles', () => {
    const bg1 = buildRecommendedCatalog(model, 'bg1')
    const resolved = resolvePresetGroups(
      [{ id: 'iwd', label: 'IWD', include: ['iwd'] }],
      bg1,
      model,
      new Set(),
      new Set(),
    )
    expect(resolved).toEqual([])
  })

  it('derives checked, unchecked, and indeterminate', () => {
    const none = resolvePresetGroups(GROUPS, catalog, model, new Set(), new Set())
    expect(none.find((g) => g.id === 'allRecommended')?.checkState).toBe('unchecked')

    const all = resolvePresetGroups(
      GROUPS,
      catalog,
      model,
      new Set(['fixes', 'ui']),
      new Set(['EEex', 'BGGO']),
    )
    expect(all.find((g) => g.id === 'allRecommended')?.checkState).toBe('checked')

    const mixed = resolvePresetGroups(
      GROUPS,
      catalog,
      model,
      new Set(['fixes']),
      new Set(),
    )
    expect(mixed.find((g) => g.id === 'allRecommended')?.checkState).toBe('indeterminate')
  })
})

describe('applyPresetGroupToCheckedSets', () => {
  it('turns listed tiles off even when another group still includes them', () => {
    const bothOn = applyPresetGroupToCheckedSets(
      new Set(['fixes', 'ui']),
      new Set(['EEex']),
      ['fixes', 'ui'],
      ['EEex'],
      true,
    )
    expect([...bothOn.recommended].sort()).toEqual(['fixes', 'ui'])
    expect([...bothOn.packages]).toEqual(['EEex'])

    const afterUncheckAll = applyPresetGroupToCheckedSets(
      bothOn.recommended,
      bothOn.packages,
      ['fixes', 'ui'],
      ['EEex'],
      false,
    )
    expect(afterUncheckAll.recommended.size).toBe(0)
    expect(afterUncheckAll.packages.size).toBe(0)
  })
})
