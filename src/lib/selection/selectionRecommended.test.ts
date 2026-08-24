import { describe, expect, it } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { createInitialSelection } from './selectionCore'
import {
  setRecommendedSelection,
  setPackageSelection,
  applyCheckedPresetTiles,
  buildRecommendedBaselineSelection,
  selectionMatchesRecommendedBaseline,
} from './selectionRecommended'

const RECOMMENDED_XML = `<?xml version="1.0"?>
<installSequence>
  <sounds recommended="sounds">
    <component id="sound:base" label="Base sound tweak" />
    <mod id="Infinity-Sounds" label="Infinity Sounds">
      <component id="sound:pkg-a" label="BG1 voices" package="BG1Sounds" />
      <component id="sound:pkg-b" label="BG1 weapons" package="BG1Sounds" />
    </mod>
    <component id="sound:vve" label="VVE BG" package="vve" engine="bg1,eet" />
  </sounds>
  <combat>
    <ai recommended="combat">
      <mod id="SCS" label="BG1 Encounters" package="encounters">
        <component id="combat:enc" label="Smarter kobolds" />
      </mod>
      <component id="combat:base" label="Faster trolls" recommended="combat" />
    </ai>
    <component id="combat:script" label="Party AI" recommended="combat" package="scripts" />
  </combat>
  <ui recommended="ui">
    <component id="ui:base" label="Auto loot" />
    <component id="ui:eeex" label="EEex" recommended="ui" package="EEex" core="1" />
  </ui>
</installSequence>`

describe('recommended mass-check', () => {
  const { model } = parseInstallSequence(RECOMMENDED_XML)

  it('recommended base selects only non-package components', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'sounds', true)
    expect(selected.has('sound:base')).toBe(true)
    expect(selected.has('sound:pkg-a')).toBe(false)
    expect(selected.has('sound:vve')).toBe(false)
  })

  it('package selection is independent of recommended base', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setPackageSelection(model, selected, 'eet', 'BG1Sounds', true)
    expect(selected.has('sound:pkg-a')).toBe(true)
    expect(selected.has('sound:pkg-b')).toBe(true)
    expect(selected.has('sound:base')).toBe(false)
    expect(selected.has('sound:vve')).toBe(false)
  })

  it('recommended and package tiles can both be checked', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'sounds', true)
    selected = setPackageSelection(model, selected, 'eet', 'vve', true)
    expect(selected.has('sound:base')).toBe(true)
    expect(selected.has('sound:vve')).toBe(true)
    expect(selected.has('sound:pkg-a')).toBe(false)
  })

  it('unchecking recommended base leaves package selections intact', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'sounds', true)
    selected = setPackageSelection(model, selected, 'eet', 'vve', true)
    selected = setRecommendedSelection(model, selected, 'eet', 'sounds', false)
    expect(selected.has('sound:base')).toBe(false)
    expect(selected.has('sound:vve')).toBe(true)
  })

  it('inherits recommended from station tag', () => {
    let selected = createInitialSelection(model, 'bg1')
    selected = setRecommendedSelection(model, selected, 'bg1', 'sounds', true)
    expect(selected.has('sound:base')).toBe(true)
  })

  it('package under combat recommended groups separately', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setPackageSelection(model, selected, 'eet', 'encounters', true)
    selected = setPackageSelection(model, selected, 'eet', 'scripts', true)
    expect(selected.has('combat:enc')).toBe(true)
    expect(selected.has('combat:script')).toBe(true)
    expect(selected.has('combat:base')).toBe(false)
  })

  it('package on same node as recommended does not match base tile', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'ui', true)
    expect(selected.has('ui:base')).toBe(true)
    expect(selected.has('ui:eeex')).toBe(false)
    selected = setPackageSelection(model, selected, 'eet', 'EEex', true)
    expect(selected.has('ui:eeex')).toBe(true)
  })

  it('baseline matching detects manual edits', () => {
    let selected = buildRecommendedBaselineSelection(
      model,
      'eet',
      new Set(['sounds']),
      new Set(),
    )
    expect(
      selectionMatchesRecommendedBaseline(model, 'eet', selected, new Set(['sounds']), new Set()),
    ).toBe(true)
    selected = new Set(selected)
    selected.add('combat:base')
    expect(
      selectionMatchesRecommendedBaseline(model, 'eet', selected, new Set(['sounds']), new Set()),
    ).toBe(false)
  })
})

const ALTS_XML = `<?xml version="1.0"?>
<installSequence>
  <content>
    <alternatives label="Postgame">
      <mod id="EndlessBG1" label="Endless BG1" recommended="blendWell">
        <component id="EBG1_Main" label="Main" core="1" />
        <component id="EBG1_Flavor" label="Flavor" />
        <component id="EBG1_Sword" label="Sword" />
      </mod>
      <mod id="Reflections" label="Reflections of Destiny">
        <component id="RoD_Main" label="Future" />
      </mod>
    </alternatives>
    <alternatives label="Competing blendWell">
      <mod id="FirstBranch" label="First" recommended="blendWell">
        <component id="first:a" label="A" />
        <component id="first:b" label="B" />
      </mod>
      <mod id="DefaultBranch" label="Default" recommended="blendWell">
        <component id="def:a" label="DA" default="1" />
        <component id="def:b" label="DB" />
      </mod>
    </alternatives>
    <alternatives label="Radio">
      <component id="radio:a" label="A" recommended="radioPick" />
      <component id="radio:b" label="B" recommended="radioPick" default="1" />
      <component id="radio:c" label="C" recommended="radioPick" />
    </alternatives>
  </content>
</installSequence>`

describe('recommended mass-check alternatives', () => {
  const { model } = parseInstallSequence(ALTS_XML)

  it('selects every matching component in a recommended mod branch', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'blendWell', true)
    expect(selected.has('EBG1_Main')).toBe(true)
    expect(selected.has('EBG1_Flavor')).toBe(true)
    expect(selected.has('EBG1_Sword')).toBe(true)
    expect(selected.has('RoD_Main')).toBe(false)
  })

  it('picks the default alternatives branch when both match', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'blendWell', true)
    expect(selected.has('def:a')).toBe(true)
    expect(selected.has('def:b')).toBe(true)
    expect(selected.has('first:a')).toBe(false)
    expect(selected.has('first:b')).toBe(false)
  })

  it('still picks a single option for component-only radios', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'radioPick', true)
    expect(selected.has('radio:b')).toBe(true)
    expect(selected.has('radio:a')).toBe(false)
    expect(selected.has('radio:c')).toBe(false)
  })
})

const UNLOCK_XML = `<?xml version="1.0"?>
<installSequence>
  <content>
    <mod id="BG1NPC" label="BG1NPC" recommended="npc" package="npcExpansions">
      <component id="bg1npc_project-main" label="Core" core="1" />
    </mod>
    <component id="bg1npc_project-sarevokdiary_sixofspades" label="Diary"
      displayIf="bg1npc_project-main" recommended="extended" />
  </content>
</installSequence>`

describe('recommended mass-check cross-tile unlock', () => {
  const { model } = parseInstallSequence(UNLOCK_XML)

  it('selects a displayIf component after a later package unlocks it', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setRecommendedSelection(model, selected, 'eet', 'extended', true)
    expect(selected.has('bg1npc_project-sarevokdiary_sixofspades')).toBe(false)
    selected = applyCheckedPresetTiles(
      model,
      selected,
      'eet',
      new Set(['extended']),
      new Set(['npcExpansions']),
    )
    expect(selected.has('bg1npc_project-main')).toBe(true)
    expect(selected.has('bg1npc_project-sarevokdiary_sixofspades')).toBe(true)
  })

  it('selects a displayIf component when the unlocking package is applied first', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setPackageSelection(model, selected, 'eet', 'npcExpansions', true)
    selected = applyCheckedPresetTiles(
      model,
      selected,
      'eet',
      new Set(['extended']),
      new Set(['npcExpansions']),
    )
    expect(selected.has('bg1npc_project-sarevokdiary_sixofspades')).toBe(true)
  })

  it('baseline converges regardless of tile order', () => {
    const selected = buildRecommendedBaselineSelection(
      model,
      'eet',
      new Set(['extended']),
      new Set(['npcExpansions']),
    )
    expect(selected.has('bg1npc_project-main')).toBe(true)
    expect(selected.has('bg1npc_project-sarevokdiary_sixofspades')).toBe(true)
  })
})
