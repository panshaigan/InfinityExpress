import { describe, expect, it } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { createInitialSelection } from './selectionCore'
import { setPackageSelection } from './selectionRecommended'
import { buildPresetTilePreview, type PresetTileRef } from './presetPreview'

const PREVIEW_XML = `<?xml version="1.0"?>
<installSequence>
  <ui recommended="ui">
    <component id="ui:base" label="Auto loot" />
    <component id="EEex:1" label="EEex" recommended="ui" package="EEex" core="1" />
    <component id="ui:eeex-dep" label="EEex tweak" recommended="ui" displayIf="EEex:1" />
  </ui>
  <combat>
    <alternatives>
      <component id="combat:a" label="Option A" level="fixes" default="1" />
      <component id="combat:b" label="Option B" level="fixes" />
    </alternatives>
  </combat>
</installSequence>`

describe('buildPresetTilePreview', () => {
  const { model } = parseInstallSequence(PREVIEW_XML)

  it('blocks displayIf dependents until unlock operand is selected', () => {
    let selected = createInitialSelection(model, 'eet')
    const tile: PresetTileRef = { kind: 'recommended', token: 'ui' }

    let preview = buildPresetTilePreview({
      model,
      game: 'eet',
      selectedIds: selected,
      tile,
      ladderChecked: new Set(),
      lowerDifficulty: false,
      higherDifficulty: false,
      checkedRecommended: new Set(),
      checkedPackages: new Set(),
    })

    expect(preview.wouldSelect.map((c) => c.componentId)).toEqual(['ui:base'])
    expect(preview.blocked.map((b) => b.component.componentId)).toEqual(['ui:eeex-dep'])
    expect(preview.blocked[0]?.reason).toBe('displayGate')

    selected = setPackageSelection(model, selected, 'eet', 'EEex', true)
    preview = buildPresetTilePreview({
      model,
      game: 'eet',
      selectedIds: selected,
      tile,
      ladderChecked: new Set(),
      lowerDifficulty: false,
      higherDifficulty: false,
      checkedRecommended: new Set(),
      checkedPackages: new Set(['EEex']),
    })

    expect(preview.wouldSelect.map((c) => c.componentId)).toContain('ui:eeex-dep')
    expect(preview.blocked).toHaveLength(0)
  })

  it('marks alternatives losers as blocked for ladder tiles', () => {
    const selected = createInitialSelection(model, 'eet')
    const tile: PresetTileRef = { kind: 'ladder', level: 'fixes' }

    const preview = buildPresetTilePreview({
      model,
      game: 'eet',
      selectedIds: selected,
      tile,
      ladderChecked: new Set(),
      lowerDifficulty: false,
      higherDifficulty: false,
      checkedRecommended: new Set(),
      checkedPackages: new Set(),
    })

    expect(preview.wouldSelect.map((c) => c.componentId)).toEqual(['combat:a'])
    expect(preview.blocked.map((b) => b.component.componentId)).toEqual(['combat:b'])
    expect(preview.blocked[0]?.reason).toBe('alternatives')
  })

  it('reports already selected when tile is checked', () => {
    let selected = createInitialSelection(model, 'eet')
    selected = setPackageSelection(model, selected, 'eet', 'EEex', true)
    const tile: PresetTileRef = { kind: 'package', token: 'EEex' }

    const preview = buildPresetTilePreview({
      model,
      game: 'eet',
      selectedIds: selected,
      tile,
      ladderChecked: new Set(),
      lowerDifficulty: false,
      higherDifficulty: false,
      checkedRecommended: new Set(),
      checkedPackages: new Set(['EEex']),
    })

    expect(preview.tileChecked).toBe(true)
    expect(preview.alreadySelected.map((c) => c.componentId)).toContain('EEex:1')
    expect(preview.wouldSelect).toHaveLength(0)
  })
})
