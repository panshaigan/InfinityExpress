import { describe, expect, it } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import {
  createInitialSelection,
  nodeSelectionState,
  toggleNode,
} from '../selection/selectionEngine'
import { buildDisplayTree } from '../selection/visibility'
import { buildInstallOrderLines } from '../export/installOrder'

const SAMPLE = `<?xml version="1.0"?>
<installSequence>
  <base label="Base">
    <component id="req_hidden" label="Required hidden" required="1" noDisplay="1" engine="bg1,eet" />
    <mod id="Demo" label="Demo Mod" engine="bg,eet">
      <component id="demo:core" label="Core" core="1" />
      <component id="demo:extra" label="Extra" />
      <component id="demo:auto" label="Auto" alwaysIf="demo:core" noDisplay="1" />
    </mod>
    <mod id="InfinityUI" label="InfinityUI" engine="bg,eet,iwd">
      <component id="infinity_ui:0" label="Core" core="1" />
      <component id="infinity_ui:1" label="Tooltip" />
      <component id="infinity_ui:2" label="Strings" alwaysIf="infinity_ui:0" noDisplay="1" />
      <alternatives label="Quick save slots">
        <component id="infinity_ui:3" label="Slots 1" />
        <component id="infinity_ui:4" label="Slots 2" />
        <component id="infinity_ui:5" label="Slots 3" default="1" />
        <component id="infinity_ui:6" label="Slots 4" />
      </alternatives>
    </mod>
    <alternatives label="Pick one">
      <component id="alt:a" label="A" />
      <component id="alt:b" label="B" default="1" />
      <component id="alt:c" label="C" />
    </alternatives>
    <group label="Solo">
      <component id="solo:1" label="Only child" />
      <component id="solo:hidden" label="Hidden" noDisplay="1" alwaysIf="solo:1" />
    </group>
  </base>
  <base engine="eet" noDisplay="1">
    <component id="eet_end" label="EET End" alwaysIf="req_hidden" engine="eet" />
  </base>
  <campaigns>
    <alternatives label="Branches">
      <component id="full" label="Full" engine="eet" />
      <group label="Partial">
        <component id="part:1" label="P1" engine="eet" />
        <component id="part:2" label="P2" engine="eet" />
      </group>
    </alternatives>
  </campaigns>
  <ui engine="iwd">
    <component id="iwd_only" label="IWD UI" />
  </ui>
  <content>
    <tweaks label="Flat tweaks" noBranches="1" engine="bg1,eet">
      <mod id="M1" label="Hidden Mod Group">
        <component id="flat:a" label="Flat A" />
        <component id="flat:b" label="Flat B" />
      </mod>
      <group label="Nested flat" noBranches="1">
        <mod id="M2">
          <component id="flat:c" label="Flat C" />
        </mod>
      </group>
    </tweaks>
    <component id="dup:first" label="First" engine="bg1" />
  </content>
  <kits>
    <component id="dup:first" label="Second occurrence" engine="bg1" />
  </kits>
</installSequence>`

describe('parse + selection', () => {
  const { model } = parseInstallSequence(SAMPLE)

  it('merges duplicate base stations for UI children but keeps order indexes', () => {
    const base = model.stations.find((s) => s.stationId === 'base')!
    expect(base.roots.length).toBe(2)
    expect(base.children.some((c) => c.attrs.label === 'Demo Mod')).toBe(true)
    const end = model.componentsById.get('eet_end')!
    const req = model.componentsById.get('req_hidden')!
    expect(end.orderIndex).toBeGreaterThan(req.orderIndex)
  })

  it('inherits engine and selects required for bg1', () => {
    const selected = createInitialSelection(model, 'bg1')
    expect(selected.has('req_hidden')).toBe(true)
    expect(selected.has('eet_end')).toBe(false)
  })

  it('EET required + alwaysIf end', () => {
    const selected = createInitialSelection(model, 'eet')
    expect(selected.has('req_hidden')).toBe(true)
    expect(selected.has('eet_end')).toBe(true)
  })

  it('core auto-selects with sibling; unchecking core clears mod', () => {
    let selected = createInitialSelection(model, 'bg1')
    const extra = model.componentsById.get('demo:extra')!
    selected = toggleNode(model, selected, 'bg1', extra, undefined, true)
    expect(selected.has('demo:core')).toBe(true)
    expect(selected.has('demo:auto')).toBe(true)

    const core = model.componentsById.get('demo:core')!
    selected = toggleNode(model, selected, 'bg1', core, undefined, false)
    expect(selected.has('demo:extra')).toBe(false)
    expect(selected.has('demo:core')).toBe(false)
  })

  it('alternatives radio among components', () => {
    let selected = createInitialSelection(model, 'bg1')
    const a = model.componentsById.get('alt:a')!
    const b = model.componentsById.get('alt:b')!
    selected = toggleNode(model, selected, 'bg1', a, undefined, true)
    selected = toggleNode(model, selected, 'bg1', b, undefined, true)
    expect(selected.has('alt:a')).toBe(false)
    expect(selected.has('alt:b')).toBe(true)
  })

  it('checking alternatives parent applies default', () => {
    let selected = createInitialSelection(model, 'bg1')
    const base = model.stations.find((s) => s.stationId === 'base')!
    const alts = base.children.find((c) => c.kind === 'alternatives')!
    selected = toggleNode(model, selected, 'bg1', alts, undefined, true)
    expect(selected.has('alt:b')).toBe(true)
    expect(selected.has('alt:a')).toBe(false)
  })

  it('alternatives container branches are exclusive', () => {
    let selected = createInitialSelection(model, 'eet')
    const full = model.componentsById.get('full')!
    const p1 = model.componentsById.get('part:1')!
    selected = toggleNode(model, selected, 'eet', full, undefined, true)
    selected = toggleNode(model, selected, 'eet', p1, undefined, true)
    expect(selected.has('full')).toBe(false)
    expect(selected.has('part:1')).toBe(true)
  })

  it('mod with nested alternatives can check then uncheck via parent', () => {
    let selected = createInitialSelection(model, 'bg1')
    const base = model.stations.find((s) => s.stationId === 'base')!
    const mod = base.children.find((c) => c.attrs.label === 'InfinityUI')!
    expect(nodeSelectionState(mod, selected, 'bg1')).toBe('unchecked')

    selected = toggleNode(model, selected, 'bg1', mod, undefined, true)
    expect(selected.has('infinity_ui:0')).toBe(true)
    expect(selected.has('infinity_ui:1')).toBe(true)
    expect(selected.has('infinity_ui:2')).toBe(true)
    expect(selected.has('infinity_ui:5')).toBe(true)
    expect(selected.has('infinity_ui:3')).toBe(false)
    expect(nodeSelectionState(mod, selected, 'bg1')).toBe('checked')

    selected = toggleNode(model, selected, 'bg1', mod, undefined, false)
    expect(selected.has('infinity_ui:0')).toBe(false)
    expect(selected.has('infinity_ui:1')).toBe(false)
    expect(selected.has('infinity_ui:2')).toBe(false)
    expect(selected.has('infinity_ui:5')).toBe(false)
    expect(nodeSelectionState(mod, selected, 'bg1')).toBe('unchecked')
  })

  it('collapses single visible child group', () => {
    const base = model.stations.find((s) => s.stationId === 'base')!
    const display = buildDisplayTree(base.children, {
      game: 'bg1',
      selectedIds: new Set(),
    })
    const solo = display.find((d) => d.node.attrs.label === 'Solo')
    expect(solo?.collapsedComponent?.componentId).toBe('solo:1')
    expect(solo?.children.length).toBe(0)
  })

  it('export preserves document order across stations', () => {
    const selected = new Set(['part:2', 'req_hidden', 'demo:core', 'iwd_only'])
    const lines = buildInstallOrderLines(model, selected)
    expect(lines.map((l) => l.split(';')[0])).toEqual([
      'req_hidden',
      'demo:core',
      'part:2',
      'iwd_only',
    ])
  })

  it('export keeps only the first occurrence of a duplicate component id', () => {
    const selected = new Set(['dup:first'])
    const lines = buildInstallOrderLines(model, selected)
    expect(lines).toEqual(['dup:first;First'])
  })

  it('iwd station visibility', () => {
    const ui = model.stations.find((s) => s.stationId === 'ui')!
    const forIwd = buildDisplayTree(ui.children, { game: 'iwd', selectedIds: new Set() })
    const forBg = buildDisplayTree(ui.children, { game: 'bg1', selectedIds: new Set() })
    expect(forIwd.length).toBe(1)
    expect(forBg.length).toBe(0)
  })

  it('noBranches flattens nested mod grouping', () => {
    const content = model.stations.find((s) => s.stationId === 'content')!
    const display = buildDisplayTree(content.children, {
      game: 'bg1',
      selectedIds: new Set(),
    })
    const tweaks = display.find((d) => d.node.attrs.label === 'Flat tweaks')
    expect(tweaks).toBeTruthy()
    const childLabels = tweaks!.children.map(
      (c) => c.node.attrs.label ?? c.collapsedComponent?.attrs.label ?? c.node.tag,
    )
    expect(childLabels).toContain('Flat A')
    expect(childLabels).toContain('Flat B')
    expect(childLabels).not.toContain('Hidden Mod Group')
    // Nested noBranches group with one leaf collapses to the group row
    const nested = tweaks!.children.find((c) => c.node.attrs.label === 'Nested flat')
    expect(nested).toBeTruthy()
    expect(nested!.collapsedComponent?.attrs.label).toBe('Flat C')
    expect(nested!.children.length).toBe(0)
  })
})
