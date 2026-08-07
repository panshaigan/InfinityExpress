import { describe, expect, it } from 'vitest'
import installSequenceXml from '../../data/InstallSequence.xml?raw'
import { parseInstallSequence } from './parseInstallSequence'
import { remapContentForGame } from './remapContentForGame'
import type { ContainerNode, TreeNode } from './schema'

const FIXTURE = `<?xml version="1.0"?>
<installSequence>
  <content>
    <bg1 label="BG1" engine="bg1,eet">
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
    <bg2 label="BG2" engine="bg2,eet">
      <npc>
        <component id="bg2:npc" label="BG2 NPC" />
      </npc>
    </bg2>
    <iwd label="IWD" engine="iwd">
      <items>
        <add>
          <component id="iwd:item" label="IWD item" />
        </add>
      </items>
    </iwd>
    <pst label="PST" engine="pst">
      <component id="pst:1" label="PST mod" />
    </pst>
    <universalBg label="Universal BG" engine="bg,eet">
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
    </universalBg>
    <universalBgIwd label="Universal BG/IWD" engine="bg,eet,iwd">
      <npc>
        <component id="ubi:npc" label="UBI NPC" />
      </npc>
      <items>
        <add>
          <component id="ubi:item" label="UBI item" />
        </add>
      </items>
    </universalBgIwd>
  </content>
</installSequence>`

function tags(nodes: TreeNode[]): string[] {
  return nodes.map((n) => n.tag)
}

function findByTag(nodes: TreeNode[], tag: string): ContainerNode {
  const found = nodes.find((n) => n.tag === tag)
  if (!found || found.kind === 'component') throw new Error(`missing ${tag}`)
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
    const snapshot = tags(content)
    const remapped = remapContentForGame(content, 'bg1')

    expect(tags(remapped)).toEqual(['bg1', 'sod', 'bg2', 'iwd', 'pst'])
    expect(tags(content)).toEqual(snapshot)

    const bg1 = findByTag(remapped, 'bg1')
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
    expect(remapped.some((n) => n.tag === 'universalBg')).toBe(false)
    expect(remapped.some((n) => n.tag === 'universalBgIwd')).toBe(false)
    const bg2 = findByTag(remapped, 'bg2')
    expect(collectComponentIds(bg2)).toEqual(
      expect.arrayContaining(['bg2:npc', 'ubg:npc', 'ubi:npc', 'ubg:item', 'ubi:item']),
    )
  })

  it('iwd: folds only universalBgIwd into iwd; leaves universalBg', () => {
    const remapped = remapContentForGame(content, 'iwd')
    expect(remapped.some((n) => n.tag === 'universalBgIwd')).toBe(false)
    expect(remapped.some((n) => n.tag === 'universalBg')).toBe(true)
    const iwd = findByTag(remapped, 'iwd')
    expect(collectComponentIds(iwd)).toEqual(
      expect.arrayContaining(['iwd:item', 'ubi:item', 'ubi:npc']),
    )
  })

  it('eet: folds universalBgIwd into universalBg; game buckets stay', () => {
    const remapped = remapContentForGame(content, 'eet')
    expect(tags(remapped)).toEqual(['bg1', 'sod', 'bg2', 'iwd', 'pst', 'universalBg'])
    const common = findByTag(remapped, 'universalBg')
    expect(collectComponentIds(common)).toEqual(
      expect.arrayContaining(['ubg:npc', 'ubi:npc', 'ubg:item', 'ubi:item', 'ubg:update']),
    )
    expect(findByTag(remapped, 'bg1').children).toHaveLength(2)
  })

  it('pst: identity (same references)', () => {
    const remapped = remapContentForGame(content, 'pst')
    expect(remapped).toBe(content)
  })

  it('does not mutate original children when remounting', () => {
    const before = JSON.stringify(
      content.map((n) => ({
        tag: n.tag,
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
          tag: n.tag,
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
    expect(bg1.filter((n) => n.tag === 'universalBg')).toHaveLength(0)
    expect(bg1.filter((n) => n.tag === 'universalBgIwd')).toHaveLength(0)
    expect(bg1.some((n) => n.tag === 'bg1')).toBe(true)
    expect(bg1.some((n) => n.tag === 'sod')).toBe(true)

    const eet = remapContentForGame(content, 'eet')
    expect(eet.filter((n) => n.tag === 'universalBgIwd')).toHaveLength(0)
    expect(eet.filter((n) => n.tag === 'universalBg')).toHaveLength(1)
  })
})
