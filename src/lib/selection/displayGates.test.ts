import { describe, expect, it } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { collectDisplayGateIds, selectionGateKey } from './displayGates'
import { buildDisplayTree, displayTreeHasVisible } from './visibility'

describe('displayGates', () => {
  const { model } = parseInstallSequence(`<?xml version="1.0"?>
<installSequence>
  <base>
    <component id="gate" label="Gate" />
    <component id="locked" label="Locked" displayIf="gate" />
    <component id="other" label="Other" />
  </base>
</installSequence>`)

  it('collects ids referenced by displayIf / displayIfNot', () => {
    expect([...collectDisplayGateIds(model)].sort()).toEqual(['gate'])
  })

  it('selectionGateKey ignores non-gate selection changes', () => {
    const gates = collectDisplayGateIds(model)
    const a = selectionGateKey(new Set(['other']), gates)
    const b = selectionGateKey(new Set(['other', 'locked']), gates)
    expect(a).toBe(b)
    expect(selectionGateKey(new Set(['gate']), gates)).not.toBe(a)
  })
})

describe('displayTreeHasVisible', () => {
  it('matches buildDisplayTree emptiness without allocating the full tree', () => {
    const { model } = parseInstallSequence(`<?xml version="1.0"?>
<installSequence>
  <base>
    <component id="gate" label="Gate" />
    <group label="Locked group" displayIf="gate">
      <component id="locked" label="Locked" />
    </group>
  </base>
</installSequence>`)
    const children = model.stations[0]!.children
    const empty = { game: 'bg1' as const, selectedIds: new Set<string>() }
    const open = { game: 'bg1' as const, selectedIds: new Set(['gate']) }
    expect(displayTreeHasVisible(children, empty)).toBe(
      buildDisplayTree(children, empty).length > 0,
    )
    expect(displayTreeHasVisible(children, open)).toBe(
      buildDisplayTree(children, open).length > 0,
    )
    expect(displayTreeHasVisible(children, empty)).toBe(true)
    expect(displayTreeHasVisible(children, open)).toBe(true)
  })

  it('is false when every component is gated closed', () => {
    const { model } = parseInstallSequence(`<?xml version="1.0"?>
<installSequence>
  <ui>
    <component id="only" label="Only" displayIf="missing" />
  </ui>
</installSequence>`)
    const children = model.stations[0]!.children
    const ctx = { game: 'bg1' as const, selectedIds: new Set<string>() }
    expect(buildDisplayTree(children, ctx)).toEqual([])
    expect(displayTreeHasVisible(children, ctx)).toBe(false)
  })
})
