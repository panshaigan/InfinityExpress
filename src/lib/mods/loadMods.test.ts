import { describe, expect, it } from 'vitest'
import { parseModsCsv, resolveModLookupKey } from './loadMods'
import type { InstallSequenceModel, TreeNode } from '../xml/schema'

describe('parseModsCsv', () => {
  it('parses header and quoted fields', () => {
    const raw = [
      'Codename,Category,URL,Game,UseMaster,UseAssets,Release,Version',
      'Totemic_Cernd,NPC,"https://github.com/Gibberlings3/Totemic_Cernd",BG2,,,2017-06-06,"v3"',
      'aTweaks,TWEAKS,"https://example.com/a,b",BG1,,,2018-05-19,"07d7bad"',
    ].join('\n')

    const map = parseModsCsv(raw)
    expect(map.size).toBe(2)
    expect(map.get('Totemic_Cernd')).toEqual({
      codename: 'Totemic_Cernd',
      url: 'https://github.com/Gibberlings3/Totemic_Cernd',
      release: '2017-06-06',
      version: 'v3',
    })
    expect(map.get('aTweaks')?.url).toBe('https://example.com/a,b')
  })

  it('keeps first row on duplicate Codename', () => {
    const raw = [
      'Codename,Category,URL,Game,UseMaster,UseAssets,Release,Version',
      'Angelo,NPC,"https://example.com/v1",BG2,,,2020-01-01,"v1"',
      'Angelo,QUEST,"https://example.com/v2",BG2,,,2021-01-01,"v2"',
    ].join('\n')

    const map = parseModsCsv(raw)
    expect(map.size).toBe(1)
    expect(map.get('Angelo')?.version).toBe('v1')
    expect(map.get('Angelo')?.url).toBe('https://example.com/v1')
  })

  it('strips BOM and ignores empty lines', () => {
    const raw =
      '\uFEFFCodename,Category,URL,Game,UseMaster,UseAssets,Release,Version\n\nEET,,,"https://x",,,2025-04-07,"v14.1"\n'
    const map = parseModsCsv(raw)
    expect(map.get('EET')?.version).toBe('v14.1')
  })
})

describe('resolveModLookupKey', () => {
  function node(
    partial: Partial<TreeNode> & Pick<TreeNode, 'key' | 'tag' | 'kind'>,
  ): TreeNode {
    return {
      attrs: {},
      effectiveEngine: '',
      children: [],
      ...partial,
    } as TreeNode
  }

  function modelWith(...nodes: TreeNode[]): InstallSequenceModel {
    const nodesByKey = new Map(nodes.map((n) => [n.key, n]))
    return {
      stations: [],
      componentsById: new Map(),
      componentsInOrder: [],
      nodesByKey,
    }
  }

  it('uses component modId when present', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
      attrs: { modId: 'IE-Snippets' },
      parentKey: 'm1',
    } as TreeNode)
    const mod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'Other' },
      children: [comp],
    })
    expect(resolveModLookupKey(modelWith(mod, comp), comp)).toBe('IE-Snippets')
  })

  it('falls back to enclosing mod id', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
      parentKey: 'm1',
    } as TreeNode)
    const mod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'EEex' },
      children: [comp],
    })
    expect(resolveModLookupKey(modelWith(mod, comp), comp)).toBe('EEex')
  })

  it('falls back to enclosing mod modId', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
      parentKey: 'm1',
    } as TreeNode)
    const mod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { modId: 'A7-LevelUpTweaks' },
      children: [comp],
    })
    expect(resolveModLookupKey(modelWith(mod, comp), comp)).toBe('A7-LevelUpTweaks')
  })

  it('returns undefined with no modId and no enclosing mod', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
    } as TreeNode)
    expect(resolveModLookupKey(modelWith(comp), comp)).toBeUndefined()
  })
})
