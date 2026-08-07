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
  it('uses tag alone for structural org folders and named sections', () => {
    expect(mergeKey(container('update'))).toBe('tag:update')
    expect(mergeKey(container('items'))).toBe('tag:items')
    expect(mergeKey(container('restorations'))).toBe('tag:restorations')
    expect(mergeKey(container('restructure'))).toBe('tag:restructure')
    expect(mergeKey(container('warriors'))).toBe('tag:warriors')
    expect(mergeKey(container('universalBg'))).toBe('tag:universalBg')
    expect(mergeKey(container('bg1'))).toBe('tag:bg1')
  })

  it('does not merge anonymous group', () => {
    expect(mergeKey(container('group', { label: 'Warrior tweaks' }))).toBeNull()
  })

  it('never merges mod / component / alternatives', () => {
    expect(mergeKey(container('mod', { id: 'x' }))).toBeNull()
    expect(mergeKey(component('c1', 0))).toBeNull()
    expect(
      mergeKey({
        ...container('alternatives', { label: 'alts' }),
        kind: 'alternatives',
      }),
    ).toBeNull()
  })
})

describe('foldSiblings', () => {
  it('folds restorations and restructure siblings by tag', () => {
    const folded = foldSiblings([
      container('restructure', {}, [component('early-restructure', 0)]),
      container('quest', {}, [component('quest-a', 1)]),
      container('restructure', {}, [component('late-restructure', 2)]),
      container('restorations', {}, [component('early-rest', 3)]),
      container('restorations', {}, [component('late-rest', 4)]),
    ])

    expect(folded.map((n) => n.tag)).toEqual(['restructure', 'quest', 'restorations'])
    expect(
      folded[0]!.children.map((c) => (c.kind === 'component' ? c.componentId : c.tag)),
    ).toEqual(['early-restructure', 'late-restructure'])
    expect(
      folded[2]!.children.map((c) => (c.kind === 'component' ? c.componentId : c.tag)),
    ).toEqual(['early-rest', 'late-rest'])
  })

  it('flattens only noBranches contributions when merging into a structured sibling', () => {
    const folded = foldSiblings([
      container('add', { label: 'New items' }, [component('early-item', 0)]),
      container('add', { noBranches: true }, [
        container('mod', { id: 'msfm' }, [component('msfm:10', 1)]),
      ]),
    ])

    expect(folded).toHaveLength(1)
    expect(folded[0]!.attrs.label).toBe('New items')
    expect(folded[0]!.attrs.noBranches).toBeUndefined()
    expect(
      folded[0]!.children.map((c) => (c.kind === 'component' ? c.componentId : c.tag)),
    ).toEqual(['early-item', 'msfm:10'])
  })

  it('materializes target noBranches then keeps structure from later siblings', () => {
    const folded = foldSiblings([
      container('add', { noBranches: true }, [
        container('mod', { id: 'msfm' }, [component('msfm:10', 0)]),
      ]),
      container('add', { label: 'Later' }, [
        container('mod', { id: 'other' }, [component('other:1', 1)]),
      ]),
    ])

    expect(folded).toHaveLength(1)
    expect(folded[0]!.attrs.noBranches).toBeUndefined()
    expect(folded[0]!.attrs.label).toBeUndefined()
    expect(
      folded[0]!.children.map((c) => (c.kind === 'component' ? c.componentId : c.tag)),
    ).toEqual(['msfm:10', 'mod'])
    expect(folded[0]!.children[1]!.attrs.id).toBe('other')
  })

  it('folds structural tags and named section tags recursively', () => {
    const earlyWarrior = component('early-warrior', 0)
    const lateWarrior = component('late-warrior', 1)
    const stats = component('stats', 2)

    const folded = foldSiblings([
      container('update', { label: 'Overhaul' }, [component('kit-fix', 3)]),
      container('tweaks', {}, [
        container('warriorTweaks', { label: 'Warrior tweaks' }, [earlyWarrior]),
      ]),
      container('update', {}, [component('skills', 4)]),
      container('tweaks', {}, [
        container('group', { label: 'Stats' }, [stats]),
        container('warriorTweaks', { label: 'Warrior tweaks' }, [lateWarrior]),
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
    expect(tweaks.children[0]!.tag).toBe('warriorTweaks')
    expect(tweaks.children[0]!.children.map((c) => (c as { componentId: string }).componentId)).toEqual([
      'early-warrior',
      'late-warrior',
    ])
    expect(tweaks.children[1]!.attrs.label).toBe('Stats')
  })

  it('folds universalBgIwd by tag and nested items/add by tag', () => {
    const folded = foldSiblings([
      container('universalBgIwd', { label: 'Universal BG/IWD mods' }, [
        container('items', {}, [
          container('add', {}, [component('early-item', 0)]),
          container('update', {}, [component('item-update', 1)]),
        ]),
      ]),
      container('universalBgIwd', { label: 'Universal BG/IWD mods' }, [
        container('items', {}, [
          container('add', {}, [component('late-item', 2)]),
          container('upgrade', {}, [component('item-upgrade', 3)]),
        ]),
      ]),
    ])

    expect(folded).toHaveLength(1)
    expect(folded[0]!.tag).toBe('universalBgIwd')
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
  <mechanics>
    <update label="Overhaul flawed kits">
      <component id="kit:early" label="Early kit" />
    </update>
    <tweaks>
      <warriorTweaks label="Warrior tweaks">
        <component id="war:early" label="Early warrior" />
      </warriorTweaks>
    </tweaks>
  </mechanics>
  <content>
    <universalBgIwd label="Universal BG/IWD mods">
      <items>
        <add>
          <component id="item:early" label="Early item" />
        </add>
      </items>
    </universalBgIwd>
  </content>
  <mechanics>
    <update>
      <component id="kit:late" label="Late kit" />
    </update>
    <tweaks>
      <group label="Stats">
        <component id="stats:1" label="Stats" />
      </group>
      <warriorTweaks label="Warrior tweaks">
        <component id="war:late" label="Late warrior" />
      </warriorTweaks>
    </tweaks>
  </mechanics>
  <content>
    <universalBgIwd label="Universal BG/IWD mods">
      <items>
        <add>
          <component id="item:late" label="Late item" />
        </add>
        <upgrade>
          <component id="item:upgrade" label="Upgrade" />
        </upgrade>
      </items>
    </universalBgIwd>
  </content>
</installSequence>`

describe('parseInstallSequence station folding', () => {
  it('folds mechanics update/tweaks/sections and content universalBgIwd/items across split blocks', () => {
    const { model } = parseInstallSequence(FOLD_SAMPLE)

    const mechanics = model.stations.find((s) => s.stationId === 'mechanics')!
    expect(mechanics.roots.length).toBe(2)
    expect(mechanics.children.map((c) => c.tag)).toEqual(['update', 'tweaks'])
    expect(mechanics.children[0]!.attrs.label).toBe('Overhaul flawed kits')
    expect(
      mechanics.children[0]!.children.map((c) => (c.kind === 'component' ? c.componentId : '?')),
    ).toEqual(['kit:early', 'kit:late'])

    const tweaks = mechanics.children[1]!
    expect(tweaks.children).toHaveLength(2)
    const warrior = tweaks.children.find((c) => c.tag === 'warriorTweaks')!
    expect(warrior.children.map((c) => (c.kind === 'component' ? c.componentId : '?'))).toEqual([
      'war:early',
      'war:late',
    ])
    expect(tweaks.children.some((c) => c.attrs.label === 'Stats')).toBe(true)

    const content = model.stations.find((s) => s.stationId === 'content')!
    expect(content.roots.length).toBe(2)
    expect(content.children).toHaveLength(1)
    expect(content.children[0]!.tag).toBe('universalBgIwd')
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

const KITS_CLASS_FOLD_SAMPLE = `<?xml version="1.0"?>
<installSequence>
  <mechanics>
    <warriors label="Warriors tweaks">
      <fighter label="Fighter">
        <component id="war:early" label="Early fighter" />
      </fighter>
      <ranger label="Ranger">
        <component id="ranger:early" label="Early ranger" />
      </ranger>
    </warriors>
    <rogues label="Rogues">
      <thief label="Thief">
        <component id="thief:early" label="Early thief" />
      </thief>
    </rogues>
  </mechanics>
  <mechanics>
    <warriors label="Warriors tweaks">
      <fighter label="Fighter">
        <component id="war:late" label="Late fighter" />
      </fighter>
      <ranger label="Ranger">
      </ranger>
      <paladin label="Paladin">
      </paladin>
      <monk label="Monk">
      </monk>
    </warriors>
    <rogues label="Rogues">
      <thief label="Thief">
      </thief>
      <bard label="Bard">
      </bard>
    </rogues>
  </mechanics>
</installSequence>`

describe('parseInstallSequence mechanics class-group folding', () => {
  it('folds nested class sections by tag across split mechanics blocks', () => {
    const { model } = parseInstallSequence(KITS_CLASS_FOLD_SAMPLE)
    const mechanics = model.stations.find((s) => s.stationId === 'mechanics')!
    expect(mechanics.roots.length).toBe(2)
    expect(mechanics.children.map((c) => c.tag)).toEqual(['warriors', 'rogues'])

    const warriors = mechanics.children.find((c) => c.tag === 'warriors')!
    expect(warriors.children.map((c) => c.tag)).toEqual([
      'fighter',
      'ranger',
      'paladin',
      'monk',
    ])
    const fighter = warriors.children.find((c) => c.tag === 'fighter')!
    expect(fighter.children.map((c) => (c.kind === 'component' ? c.componentId : '?'))).toEqual([
      'war:early',
      'war:late',
    ])
    const ranger = warriors.children.find((c) => c.tag === 'ranger')!
    expect(ranger.children.map((c) => (c.kind === 'component' ? c.componentId : '?'))).toEqual([
      'ranger:early',
    ])
  })
})

describe('curated InstallSequence.xml folding', () => {
  it('folds duplicate mechanics class groups and content universalBgIwd', () => {
    const { model } = parseInstallSequence(installSequenceXml)
    const mechanics = model.stations.find((s) => s.stationId === 'mechanics')!
    expect(mechanics.roots.length).toBe(2)
    expect(mechanics.children.map((c) => c.tag)).toEqual([
      'warriors',
      'rogues',
      'spellcasters',
      'multi',
      'universal',
      'stats',
      'proficiencies',
    ])

    const warriors = mechanics.children.find((c) => c.tag === 'warriors')!
    expect(warriors.children.map((c) => c.tag).filter((t) => t !== 'component')).toEqual([
      'fighter',
      'ranger',
      'paladin',
      'monk',
    ])
    // fighters also have direct component children mixed in
    expect(warriors.children.some((c) => c.tag === 'fighter')).toBe(true)
    const fighter = warriors.children.find((c) => c.tag === 'fighter')!
    expect(
      fighter.children.some(
        (c) => c.kind === 'component' && c.componentId === 'Morpheus562sKitpackShieldBreaker',
      ),
    ).toBe(true)
    expect(
      fighter.children.some(
        (c) => c.kind === 'component' && c.componentId === 'SkillsAndAbilitiesFighter',
      ),
    ).toBe(true)
    const wizardSlayer = fighter.children.find((c) => c.tag === 'wizardSlayer')!
    expect(
      wizardSlayer.children.some(
        (c) => c.kind === 'component' && c.componentId === 'ArtisansKitpack:1006',
      ),
    ).toBe(true)
    expect(
      wizardSlayer.children.some(
        (c) => c.kind === 'component' && c.componentId === 'SkillsAndAbilitiesDI1',
      ),
    ).toBe(true)

    const warriorComponentIds = (() => {
      const ids: string[] = []
      const walk = (n: TreeNode) => {
        if (n.kind === 'component') ids.push(n.componentId)
        else n.children.forEach(walk)
      }
      walk(warriors)
      return ids
    })()
    expect(warriorComponentIds).toContain('ZSTweaks:2120')

    const content = model.stations.find((s) => s.stationId === 'content')!
    expect(content.roots.length).toBe(3)
    const commons = content.children.filter((c) => c.tag === 'universalBgIwd')
    expect(commons).toHaveLength(1)
    const items = commons[0]!.children.filter((c) => c.tag === 'items')
    expect(items).toHaveLength(1)
    const add = items[0]!.children.find((c) => c.tag === 'add')!
    expect(
      add.children.some((c) => c.kind === 'component' && c.componentId === 'rr:7'),
    ).toBe(true)

    const sod = content.children.find((c) => c.tag === 'sod')!
    expect(sod.children.filter((c) => c.tag === 'restructure')).toHaveLength(1)
    const sodRestructure = sod.children.find((c) => c.tag === 'restructure')!
    const sodRestructureIds: string[] = []
    const walkSod = (n: (typeof sodRestructure.children)[0]) => {
      if (n.kind === 'component') sodRestructureIds.push(n.componentId)
      else n.children.forEach(walkSod)
    }
    sodRestructure.children.forEach(walkSod)
    expect(sodRestructureIds).toContain('Reflections_of_Destiny:200')
    expect(sodRestructureIds).toContain('C#AnotherFineHell-Main')

    const earlyWarrior = model.componentsById.get('ZSTweaks:2120')!
    const lateItem = model.componentsById.get('rr:7')!
    expect(earlyWarrior.orderIndex).toBeLessThan(lateItem.orderIndex)
  })
})
