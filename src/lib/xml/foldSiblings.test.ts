import { describe, expect, it } from 'vitest'
import { foldSiblings, mergeKey } from './foldSiblings'
import { parseInstallSequence } from './parseInstallSequence'
import type { ContainerNode, TreeNode } from './schema'
import installSequenceXml from '../../data/InstallSequence.xml?raw'
import { buildInstallOrderLines } from '../export/installOrder'

function container(
  tag: string,
  attrs: ContainerNode['attrs'] = {},
  children: TreeNode[] = [],
): ContainerNode {
  return {
    key: `${tag}-${Math.random().toString(36).slice(2, 8)}`,
    tag,
    kind: 'container',
    attrs,
    effectiveEngine: '',
    children,
  }
}

function component(id: string, orderIndex: number): TreeNode {
  return {
    key: `component-${id}`,
    tag: 'component',
    kind: 'component',
    attrs: { id, label: id },
    effectiveEngine: '',
    children: [],
    componentId: id,
    orderIndex,
  }
}

describe('mergeKey', () => {
  it('prefers sectionId over structural tag', () => {
    expect(mergeKey(container('tweaks', { sectionId: 'a' }))).toBe('sectionId:a')
  })

  it('uses tag alone for structural org folders', () => {
    expect(mergeKey(container('update'))).toBe('tag:update')
    expect(mergeKey(container('items'))).toBe('tag:items')
  })

  it('does not merge group/common without sectionId', () => {
    expect(mergeKey(container('group', { label: 'Warrior tweaks' }))).toBeNull()
    expect(mergeKey(container('common', { label: 'Universal' }))).toBeNull()
  })

  it('never merges mod / component / alternatives', () => {
    expect(mergeKey(container('mod', { id: 'x', sectionId: 'x' }))).toBeNull()
    expect(mergeKey(component('c1', 0))).toBeNull()
    expect(
      mergeKey({
        ...container('alternatives', { sectionId: 'alts' }),
        kind: 'alternatives',
      }),
    ).toBeNull()
  })
})

describe('foldSiblings', () => {
  it('folds structural tags and sectionId groups recursively', () => {
    const earlyWarrior = component('early-warrior', 0)
    const lateWarrior = component('late-warrior', 1)
    const stats = component('stats', 2)

    const folded = foldSiblings([
      container('update', { label: 'Overhaul' }, [component('kit-fix', 3)]),
      container('tweaks', {}, [
        container('group', { sectionId: 'warrior-tweaks', label: 'Warrior tweaks' }, [
          earlyWarrior,
        ]),
      ]),
      container('update', {}, [component('skills', 4)]),
      container('tweaks', {}, [
        container('group', { label: 'Stats' }, [stats]),
        container('group', { sectionId: 'warrior-tweaks', label: 'Warrior tweaks' }, [
          lateWarrior,
        ]),
      ]),
    ])

    expect(folded.map((n) => n.tag)).toEqual(['update', 'tweaks'])
    expect(folded[0]!.attrs.label).toBe('Overhaul')
    expect(folded[0]!.children.map((c) => (c.kind === 'component' ? c.componentId : c.tag))).toEqual([
      'kit-fix',
      'skills',
    ])

    const tweaks = folded[1]!
    expect(tweaks.children).toHaveLength(2)
    expect(tweaks.children[0]!.attrs.sectionId).toBe('warrior-tweaks')
    expect(tweaks.children[0]!.children.map((c) => (c as { componentId: string }).componentId)).toEqual([
      'early-warrior',
      'late-warrior',
    ])
    expect(tweaks.children[1]!.attrs.label).toBe('Stats')
  })

  it('folds common by sectionId and nested items/add by tag', () => {
    const folded = foldSiblings([
      container('common', { sectionId: 'universal-bg-iwd', label: 'Universal BG/IWD mods' }, [
        container('items', {}, [
          container('add', {}, [component('early-item', 0)]),
          container('update', {}, [component('item-update', 1)]),
        ]),
      ]),
      container('common', { sectionId: 'universal-bg-iwd', label: 'Universal BG/IWD mods' }, [
        container('items', {}, [
          container('add', {}, [component('late-item', 2)]),
          container('upgrade', {}, [component('item-upgrade', 3)]),
        ]),
      ]),
    ])

    expect(folded).toHaveLength(1)
    const items = folded[0]!.children
    expect(items).toHaveLength(1)
    expect(items[0]!.tag).toBe('items')
    const folders = items[0]!.children
    expect(folders.map((f) => f.tag)).toEqual(['add', 'update', 'upgrade'])
    expect(folders[0]!.children.map((c) => (c as { componentId: string }).componentId)).toEqual([
      'early-item',
      'late-item',
    ])
  })
})

const FOLD_SAMPLE = `<?xml version="1.0"?>
<installSequence>
  <kits>
    <update label="Overhaul flawed kits">
      <component id="kit:early" label="Early kit" />
    </update>
    <tweaks>
      <group sectionId="warrior-tweaks" label="Warrior tweaks">
        <component id="war:early" label="Early warrior" />
      </group>
    </tweaks>
  </kits>
  <content>
    <common sectionId="universal-bg-iwd" label="Universal BG/IWD mods">
      <items>
        <add>
          <component id="item:early" label="Early item" />
        </add>
      </items>
    </common>
  </content>
  <kits>
    <update>
      <component id="kit:late" label="Late kit" />
    </update>
    <tweaks>
      <group label="Stats">
        <component id="stats:1" label="Stats" />
      </group>
      <group sectionId="warrior-tweaks" label="Warrior tweaks">
        <component id="war:late" label="Late warrior" />
      </group>
    </tweaks>
  </kits>
  <content>
    <common sectionId="universal-bg-iwd" label="Universal BG/IWD mods">
      <items>
        <add>
          <component id="item:late" label="Late item" />
        </add>
        <upgrade>
          <component id="item:upgrade" label="Upgrade" />
        </upgrade>
      </items>
    </common>
  </content>
</installSequence>`

describe('parseInstallSequence station folding', () => {
  it('folds kits update/tweaks/groups and content common/items across split blocks', () => {
    const { model } = parseInstallSequence(FOLD_SAMPLE)

    const kits = model.stations.find((s) => s.stationId === 'kits')!
    expect(kits.roots.length).toBe(2)
    expect(kits.children.map((c) => c.tag)).toEqual(['update', 'tweaks'])
    expect(kits.children[0]!.attrs.label).toBe('Overhaul flawed kits')
    expect(
      kits.children[0]!.children.map((c) => (c.kind === 'component' ? c.componentId : '?')),
    ).toEqual(['kit:early', 'kit:late'])

    const tweaks = kits.children[1]!
    expect(tweaks.children).toHaveLength(2)
    const warrior = tweaks.children.find((c) => c.attrs.sectionId === 'warrior-tweaks')!
    expect(warrior.children.map((c) => (c.kind === 'component' ? c.componentId : '?'))).toEqual([
      'war:early',
      'war:late',
    ])
    expect(tweaks.children.some((c) => c.attrs.label === 'Stats')).toBe(true)

    const content = model.stations.find((s) => s.stationId === 'content')!
    expect(content.roots.length).toBe(2)
    expect(content.children).toHaveLength(1)
    expect(content.children[0]!.attrs.sectionId).toBe('universal-bg-iwd')
    const items = content.children[0]!.children
    expect(items).toHaveLength(1)
    expect(items[0]!.children.map((c) => c.tag)).toEqual(['add', 'upgrade'])
    expect(
      items[0]!.children[0]!.children.map((c) => (c.kind === 'component' ? c.componentId : '?')),
    ).toEqual(['item:early', 'item:late'])
  })

  it('keeps document order indexes for export after folding', () => {
    const { model } = parseInstallSequence(FOLD_SAMPLE)
    expect(model.componentsById.get('kit:early')!.orderIndex).toBeLessThan(
      model.componentsById.get('kit:late')!.orderIndex,
    )
    expect(model.componentsById.get('item:early')!.orderIndex).toBeLessThan(
      model.componentsById.get('item:late')!.orderIndex,
    )

    const selected = new Set(model.componentsInOrder.map((c) => c.componentId))
    const lines = buildInstallOrderLines(model, selected)
    expect(lines.map((l) => l.split(';')[0])).toEqual([
      'kit:early',
      'war:early',
      'item:early',
      'kit:late',
      'stats:1',
      'war:late',
      'item:late',
      'item:upgrade',
    ])
  })
})

describe('curated InstallSequence.xml folding', () => {
  it('folds duplicate kits groups and content common', () => {
    const { model } = parseInstallSequence(installSequenceXml)
    const kits = model.stations.find((s) => s.stationId === 'kits')!
    expect(kits.roots.length).toBe(2)
    expect(kits.children.filter((c) => c.tag === 'update')).toHaveLength(1)
    expect(kits.children.filter((c) => c.tag === 'tweaks')).toHaveLength(1)

    const tweaks = kits.children.find((c) => c.tag === 'tweaks')!
    const warriorGroups = tweaks.children.filter((c) => c.attrs.sectionId === 'warrior-tweaks')
    expect(warriorGroups).toHaveLength(1)
    const warriorComponentIds = (() => {
      const ids: string[] = []
      const walk = (n: (typeof warriorGroups)[0]) => {
        if (n.kind === 'component') ids.push(n.componentId)
        else n.children.forEach(walk)
      }
      walk(warriorGroups[0]!)
      return ids
    })()
    expect(warriorComponentIds).toContain('ZSTweaks:2120')
    expect(warriorComponentIds).toContain('SkillsAndAbilitiesWeaponProf1')

    const content = model.stations.find((s) => s.stationId === 'content')!
    expect(content.roots.length).toBe(2)
    const commons = content.children.filter((c) => c.attrs.sectionId === 'universal-bg-iwd')
    expect(commons).toHaveLength(1)
    const items = commons[0]!.children.filter((c) => c.tag === 'items')
    expect(items).toHaveLength(1)
    const add = items[0]!.children.find((c) => c.tag === 'add')!
    expect(
      add.children.some((c) => c.kind === 'component' && c.componentId === 'rr:7'),
    ).toBe(true)

    const earlyWarrior = model.componentsById.get('ZSTweaks:2120')!
    const lateWarrior = model.componentsById.get('SkillsAndAbilitiesWeaponProf1')!
    const lateItem = model.componentsById.get('rr:7')!
    expect(earlyWarrior.orderIndex).toBeLessThan(lateItem.orderIndex)
    expect(lateItem.orderIndex).toBeLessThan(lateWarrior.orderIndex)
  })
})
