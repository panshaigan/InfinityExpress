import { describe, expect, it } from 'vitest'
import {
  collectAuthorOptions,
  formatBytes,
  hasModField,
  modSizeBounds,
  parseModsCsv,
  resolveModLookupKey,
  resolveModType,
  shouldShowModTypeBadge,
} from './loadMods'
import type { InstallSequenceModel, TreeNode } from '../xml/schema'

const HEADER =
  'Codename,Category,URL,Game,UseMaster,UseAssets,Release,Version,Size,Author,Readme,Type'

describe('parseModsCsv', () => {
  it('parses header and quoted fields including Size, Author, and Readme', () => {
    const raw = [
      HEADER,
      'Totemic_Cernd,NPC,"https://github.com/Gibberlings3/Totemic_Cernd",BG2,,,2017-06-06,"v3",12345,Gibberlings3,,minor',
      'aTweaks,TWEAKS,"https://example.com/a,b",BG1,,,2018-05-19,"07d7bad",1000808525,Morpheus562,"https://example.com/readme",major',
    ].join('\n')

    const map = parseModsCsv(raw)
    expect(map.size).toBe(2)
    expect(map.get('Totemic_Cernd')).toEqual({
      codename: 'Totemic_Cernd',
      category: 'NPC',
      url: 'https://github.com/Gibberlings3/Totemic_Cernd',
      readme: '',
      release: '2017-06-06',
      version: 'v3',
      sizeBytes: 12345,
      author: 'Gibberlings3',
      type: 'minor',
    })
    expect(map.get('aTweaks')?.url).toBe('https://example.com/a,b')
    expect(map.get('aTweaks')?.category).toBe('TWEAKS')
    expect(map.get('aTweaks')?.readme).toBe('https://example.com/readme')
    expect(map.get('aTweaks')?.sizeBytes).toBe(1000808525)
    expect(map.get('aTweaks')?.author).toBe('Morpheus562')
    expect(map.get('aTweaks')?.type).toBe('major')
  })

  it('keeps first row on duplicate Codename', () => {
    const raw = [
      HEADER,
      'Angelo,NPC,"https://example.com/v1",BG2,,,2020-01-01,"v1",100,A,https://r1,minor',
      'Angelo,QUEST,"https://example.com/v2",BG2,,,2021-01-01,"v2",200,B,https://r2,major',
    ].join('\n')

    const map = parseModsCsv(raw)
    expect(map.size).toBe(1)
    expect(map.get('Angelo')?.version).toBe('v1')
    expect(map.get('Angelo')?.url).toBe('https://example.com/v1')
    expect(map.get('Angelo')?.readme).toBe('https://r1')
    expect(map.get('Angelo')?.sizeBytes).toBe(100)
    expect(map.get('Angelo')?.author).toBe('A')
  })

  it('strips BOM and ignores empty lines', () => {
    const raw =
      `\uFEFF${HEADER}\n\nEET,BASE,"https://x",BG2,,,2025-04-07,"v14.1",42,K4thos,,major\n`
    const map = parseModsCsv(raw)
    expect(map.get('EET')?.version).toBe('v14.1')
    expect(map.get('EET')?.sizeBytes).toBe(42)
    expect(map.get('EET')?.author).toBe('K4thos')
    expect(map.get('EET')?.readme).toBe('')
  })

  it('treats missing or invalid Size as null', () => {
    const raw = [
      HEADER,
      'NoSize,NPC,"https://x",BG2,,,2020-01-01,"v1",,AuthorA,,',
      'BadSize,NPC,"https://x",BG2,,,2020-01-01,"v1",nope,AuthorB,,',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('NoSize')?.sizeBytes).toBeNull()
    expect(map.get('BadSize')?.sizeBytes).toBeNull()
  })

  it('treats missing Readme column as empty string', () => {
    const raw = [
      'Codename,Category,URL,Game,UseMaster,UseAssets,Release,Version,Size,Author',
      'NoReadmeCol,NPC,"https://x",BG2,,,2020-01-01,"v1",10,AuthorA,',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('NoReadmeCol')?.readme).toBe('')
    expect(map.get('NoReadmeCol')?.type).toBe('')
  })

  it('treats missing Category and Type columns as empty string', () => {
    const raw = [
      'Codename,URL,Game,UseMaster,UseAssets,Release,Version,Size,Author,Readme',
      'Bare,NPC,"https://x",BG2,,,2020-01-01,"v1",10,AuthorA,',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('Bare')?.category).toBe('')
    expect(map.get('Bare')?.type).toBe('')
  })
})

describe('formatBytes', () => {
  it('formats 1024-based human sizes', () => {
    expect(formatBytes(67)).toBe('67 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(7898622)).toBe('7.5 MB')
    expect(formatBytes(2542925946)).toBe('2.4 GB')
  })
})

describe('modSizeBounds', () => {
  it('returns min/max over known sizes', () => {
    const map = parseModsCsv(
      [
        HEADER,
        'a,NPC,"https://x",BG2,,,2020-01-01,"v1",100,A,,',
        'b,NPC,"https://x",BG2,,,2020-01-01,"v1",500,B,,',
        'c,NPC,"https://x",BG2,,,2020-01-01,"v1",,C,,',
      ].join('\n'),
    )
    expect(modSizeBounds(map)).toEqual({ min: 100, max: 500 })
  })

  it('returns null when no sizes', () => {
    const map = parseModsCsv(
      [HEADER, 'a,NPC,"https://x",BG2,,,2020-01-01,"v1",,A,,'].join('\n'),
    )
    expect(modSizeBounds(map)).toBeNull()
  })
})

describe('collectAuthorOptions', () => {
  it('returns authors with at least minMods, sorted by count then name', () => {
    const rows = [
      HEADER,
      ...Array.from({ length: 3 }, (_, i) => `m${i},NPC,"https://x",BG2,,,2020-01-01,"v1",1,Lava,,`),
      ...Array.from({ length: 3 }, (_, i) => `n${i},NPC,"https://x",BG2,,,2020-01-01,"v1",1,Argent77,,`),
      'solo,NPC,"https://x",BG2,,,2020-01-01,"v1",1,OnlyOne,,',
      'duo1,NPC,"https://x",BG2,,,2020-01-01,"v1",1,Pair,,',
      'duo2,NPC,"https://x",BG2,,,2020-01-01,"v1",1,Pair,,',
    ]
    const map = parseModsCsv(rows.join('\n'))
    expect(collectAuthorOptions(map, 3)).toEqual([
      { name: 'Argent77', count: 3 },
      { name: 'Lava', count: 3 },
    ])
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

describe('hasModField', () => {
  it('accepts non-empty values other than dash', () => {
    expect(hasModField('major')).toBe(true)
    expect(hasModField('minor')).toBe(true)
  })

  it('rejects empty and dash placeholders', () => {
    expect(hasModField('')).toBe(false)
    expect(hasModField('-')).toBe(false)
    expect(hasModField(undefined)).toBe(false)
  })
})

describe('shouldShowModTypeBadge', () => {
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

  it('returns true for mod rows', () => {
    const mod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'MyMod' },
    })
    expect(shouldShowModTypeBadge(modelWith(mod), mod)).toBe(true)
  })

  it('returns false for components under a mod', () => {
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
      attrs: { id: 'MyMod' },
      children: [comp],
    })
    expect(shouldShowModTypeBadge(modelWith(mod, comp), comp)).toBe(false)
  })

  it('returns true for standalone components', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
      attrs: { modId: 'Loretakers' },
    } as TreeNode)
    expect(shouldShowModTypeBadge(modelWith(comp), comp)).toBe(true)
  })

  it('returns false for non-mod non-component tags', () => {
    const alt = node({
      key: 'a1',
      tag: 'alternatives',
      kind: 'alternatives',
    })
    expect(shouldShowModTypeBadge(modelWith(alt), alt)).toBe(false)
  })
})

describe('resolveModType', () => {
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

  const modsByCodename = parseModsCsv(
    [
      HEADER,
      'MyMod,QUEST,"https://x",BG2,,,2020-01-01,"v1",100,Author,,major',
      'CompMod,QUEST,"https://x",BG2,,,2020-01-01,"v1",100,Author,,compilation',
      'NoType,NPC,"https://x",BG2,,,2020-01-01,"v1",100,Author,,-',
      'EmptyType,NPC,"https://x",BG2,,,2020-01-01,"v1",100,Author,,',
    ].join('\n'),
  )

  it('returns mods.csv Type for a resolvable codename', () => {
    const mod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'MyMod' },
    })
    expect(resolveModType(modelWith(mod), modsByCodename, mod)).toBe('major')
  })

  it('keeps compilation on mod rows', () => {
    const mod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'CompMod' },
    })
    expect(resolveModType(modelWith(mod), modsByCodename, mod)).toBe('compilation')
  })

  it('remaps compilation to minor for component rows', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
      attrs: { modId: 'CompMod' },
    } as TreeNode)
    expect(resolveModType(modelWith(comp), modsByCodename, comp)).toBe('minor')
  })

  it('keeps compilation when lookup is a component but display is a mod', () => {
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
      attrs: { id: 'CompMod' },
      children: [comp],
    })
    expect(
      resolveModType(modelWith(mod, comp), modsByCodename, comp, mod),
    ).toBe('compilation')
  })

  it('returns undefined when codename is missing', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
    } as TreeNode)
    expect(resolveModType(modelWith(comp), modsByCodename, comp)).toBeUndefined()
  })

  it('returns undefined for dash or empty Type', () => {
    const dashMod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'NoType' },
    })
    const emptyMod = node({
      key: 'm2',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'EmptyType' },
    })
    expect(resolveModType(modelWith(dashMod), modsByCodename, dashMod)).toBeUndefined()
    expect(resolveModType(modelWith(emptyMod), modsByCodename, emptyMod)).toBeUndefined()
  })
})
