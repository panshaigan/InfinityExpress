import { describe, expect, it } from 'vitest'
import installSequenceXml from '../../data/InstallSequence.xml?raw'
import { parseInstallSequence } from './parseInstallSequence'
import { remapContentForGame } from './remapContentForGame'
import type { ContainerNode, TreeNode } from './schema'

const FIXTURE = `<?xml version="1.0"?>
<installSequence>
  <content>
    <bg1 sectionId="bg1-content" label="BG1" engine="bg1,eet">
      <npc>
        <component id="bg1:npc" label="BG1 NPC" />
      </npc>
      <items>
        <add>
          <component id="bg1:item" label="BG1 item" />
        </add>
      </items>
    </bg1>
    <sod label="SoD" engine="bg1,eet">
      <component id="sod:1" label="SoD mod" />
    </sod>
    <bg2 sectionId="bg2-content" label="BG2" engine="bg2,eet">
      <npc>
        <component id="bg2:npc" label="BG2 NPC" />
      </npc>
    </bg2>
    <iwd sectionId="iwd-content" label="IWD" engine="iwd">
      <items>
        <add>
          <component id="iwd:item" label="IWD item" />
        </add>
      </items>
    </iwd>
    <pst label="PST" engine="pst">
      <component id="pst:1" label="PST mod" />
    </pst>
    <common sectionId="universal-bg-content" label="Universal BG" engine="bg,eet">
      <npc>
        <component id="ubg:npc" label="UBG NPC" />
      </npc>
      <items>
        <add>
          <component id="ubg:item" label="UBG item" />
        </add>
        <update>
          <component id="ubg:update" label="UBG update" />
        </update>
      </items>
    </common>
    <common sectionId="universal-bg-iwd" label="Universal BG/IWD" engine="bg,eet,iwd">
      <npc>
        <component id="ubi:npc" label="UBI NPC" />
      </npc>
      <items>
        <add>
          <component id="ubi:item" label="UBI item" />
        </add>
      </items>
    </common>
  </content>
</installSequence>`

function sectionIds(nodes: TreeNode[]): (string | undefined)[] {
  return nodes.map((n) => n.attrs.sectionId ?? n.tag)
}

function findSection(nodes: TreeNode[], sectionId: string): ContainerNode {
  const found = nodes.find((n) => n.attrs.sectionId === sectionId)
  if (!found || found.kind === 'component') throw new Error(`missing ${sectionId}`)
  return found
}

function collectComponentIds(node: TreeNode): string[] {
  if (node.kind === 'component') return [node.componentId]
  return node.children.flatMap(collectComponentIds)
}

describe('remapContentForGame', () => {
  const { model } = parseInstallSequence(FIXTURE)
  const content = model.stations.find((s) => s.stationId === 'content')!.children

  it('bg1: folds both commons into bg1; sod stays; nested npc/items reunite', () => {
    const snapshot = content.map((n) => n.attrs.sectionId)
    const remapped = remapContentForGame(content, 'bg1')

    expect(sectionIds(remapped)).toEqual([
      'bg1-content',
      'sod',
      'bg2-content',
      'iwd-content',
      'pst',
    ])
    expect(content.map((n) => n.attrs.sectionId)).toEqual(snapshot)

    const bg1 = findSection(remapped, 'bg1-content')
    expect(bg1.children.filter((c) => c.tag === 'npc')).toHaveLength(1)
    expect(bg1.children.filter((c) => c.tag === 'items')).toHaveLength(1)
    const ids = collectComponentIds(bg1)
    expect(ids).toEqual(
      expect.arrayContaining(['bg1:npc', 'ubg:npc', 'ubi:npc', 'bg1:item', 'ubg:item', 'ubi:item', 'ubg:update']),
    )
    expect(remapped.some((n) => n.tag === 'sod')).toBe(true)
  })

  it('bg2: folds both commons into bg2', () => {
    const remapped = remapContentForGame(content, 'bg2')
    expect(remapped.some((n) => n.attrs.sectionId === 'universal-bg-content')).toBe(false)
    expect(remapped.some((n) => n.attrs.sectionId === 'universal-bg-iwd')).toBe(false)
    const bg2 = findSection(remapped, 'bg2-content')
    expect(collectComponentIds(bg2)).toEqual(
      expect.arrayContaining(['bg2:npc', 'ubg:npc', 'ubi:npc', 'ubg:item', 'ubi:item']),
    )
  })

  it('iwd: folds only universal-bg-iwd into iwd; leaves universal-bg-content', () => {
    const remapped = remapContentForGame(content, 'iwd')
    expect(remapped.some((n) => n.attrs.sectionId === 'universal-bg-iwd')).toBe(false)
    expect(remapped.some((n) => n.attrs.sectionId === 'universal-bg-content')).toBe(true)
    const iwd = findSection(remapped, 'iwd-content')
    expect(collectComponentIds(iwd)).toEqual(
      expect.arrayContaining(['iwd:item', 'ubi:item', 'ubi:npc']),
    )
  })

  it('eet: folds universal-bg-iwd into universal-bg-content; game buckets stay', () => {
    const remapped = remapContentForGame(content, 'eet')
    expect(sectionIds(remapped)).toEqual([
      'bg1-content',
      'sod',
      'bg2-content',
      'iwd-content',
      'pst',
      'universal-bg-content',
    ])
    const common = findSection(remapped, 'universal-bg-content')
    expect(collectComponentIds(common)).toEqual(
      expect.arrayContaining(['ubg:npc', 'ubi:npc', 'ubg:item', 'ubi:item', 'ubg:update']),
    )
    expect(findSection(remapped, 'bg1-content').children).toHaveLength(2)
  })

  it('pst: identity (same references)', () => {
    const remapped = remapContentForGame(content, 'pst')
    expect(remapped).toBe(content)
  })

  it('does not mutate original children when remounting', () => {
    const before = JSON.stringify(
      content.map((n) => ({
        sectionId: n.attrs.sectionId,
        childCount: n.children.length,
        ids: collectComponentIds(n),
      })),
    )
    remapContentForGame(content, 'bg1')
    remapContentForGame(content, 'eet')
    remapContentForGame(content, 'iwd')
    expect(
      JSON.stringify(
        content.map((n) => ({
          sectionId: n.attrs.sectionId,
          childCount: n.children.length,
          ids: collectComponentIds(n),
        })),
      ),
    ).toBe(before)
  })
})

describe('curated InstallSequence.xml content remount', () => {
  it('bg1/eet have no leftover absorbed commons at top level', () => {
    const { model } = parseInstallSequence(installSequenceXml)
    const content = model.stations.find((s) => s.stationId === 'content')!.children

    const bg1 = remapContentForGame(content, 'bg1')
    expect(bg1.filter((n) => n.attrs.sectionId === 'universal-bg-content')).toHaveLength(0)
    expect(bg1.filter((n) => n.attrs.sectionId === 'universal-bg-iwd')).toHaveLength(0)
    expect(bg1.some((n) => n.attrs.sectionId === 'bg1-content')).toBe(true)
    expect(bg1.some((n) => n.tag === 'sod')).toBe(true)

    const eet = remapContentForGame(content, 'eet')
    expect(eet.filter((n) => n.attrs.sectionId === 'universal-bg-iwd')).toHaveLength(0)
    expect(eet.filter((n) => n.attrs.sectionId === 'universal-bg-content')).toHaveLength(1)
  })
})
