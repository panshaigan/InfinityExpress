import { describe, expect, it } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { createInitialSelection } from './selectionCore'
import {
  setRecommendedSelection,
  setPackageSelection,
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
