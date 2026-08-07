import { describe, expect, it } from 'vitest'
import installSequenceXml from '../../data/InstallSequence.xml?raw'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { createInitialSelection } from '../selection/selectionEngine'
import { buildDisplayTree } from '../selection/visibility'
import { engineMatches } from '../engine/matchEngine'

describe('curated InstallSequence.xml', () => {
  it('parses without throwing', () => {
    const { model, warnings } = parseInstallSequence(installSequenceXml)
    expect(model.componentsInOrder.length).toBeGreaterThan(100)
    expect(model.stations.length).toBeGreaterThan(5)
    // Soft check — warnings are OK but should not explode
    expect(Array.isArray(warnings)).toBe(true)
  })

  it('EET shows eet/eet1 and bg,eet components', () => {
    const { model } = parseInstallSequence(installSequenceXml)
    const selected = createInitialSelection(model, 'eet')
    expect(selected.has('EET:0')).toBe(true)

    const base = model.stations.find((s) => s.stationId === 'base')!
    const display = buildDisplayTree(base.children, { game: 'eet', selectedIds: selected })
    expect(display.length).toBeGreaterThan(0)

    const eeex = model.componentsById.get('EEex:1')!
    expect(engineMatches(eeex.effectiveEngine, 'eet')).toBe(true)
    expect(engineMatches(eeex.effectiveEngine, 'bg1')).toBe(true)
  })

  it('bg token alone does not match eet for inheritance samples', () => {
    expect(engineMatches('bg', 'eet')).toBe(false)
  })
})

describe('readme attribute', () => {
  it('preserves component readme URL from XML', () => {
    const xml = `<?xml version="1.0"?>
<installSequence>
  <base>
    <component id="Demo:0" label="Demo" readme="https://example.com/readme.html" />
  </base>
</installSequence>`
    const { model } = parseInstallSequence(xml)
    const comp = model.componentsById.get('Demo:0')
    expect(comp?.attrs.readme).toBe('https://example.com/readme.html')
  })
})

describe('name attribute', () => {
  it('preserves WeiDU name from XML', () => {
    const xml = `<?xml version="1.0"?>
<installSequence>
  <base>
    <component id="Demo:0" name="WeiDU Title" label="Curated Label" />
  </base>
</installSequence>`
    const { model } = parseInstallSequence(xml)
    const comp = model.componentsById.get('Demo:0')
    expect(comp?.attrs.name).toBe('WeiDU Title')
    expect(comp?.attrs.label).toBe('Curated Label')
  })
})
