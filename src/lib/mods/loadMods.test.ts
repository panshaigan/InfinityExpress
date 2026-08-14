import { describe, expect, it } from 'vitest'
import {
  buildModComponentCatalogStats,
  collectAuthorOptions,
  countSelectedMods,
  formatBytes,
  hasModField,
  listSelectedModCodenames,
  modCodenamesWithCatalogComponents,
  modSizeBounds,
  parseModsCsv,
  resolveModLookupKey,
  resolveModStability,
} from './loadMods'
import type { ComponentNode, InstallSequenceModel, TreeNode } from '../xml/schema'

const HEADER =
  'Codename,Category,URL,Game,Track,Download,Release,Version,Size,Author,Readme,Type'

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
      name: '',
      abbreviation: '',
      category: 'NPC',
      url: 'https://github.com/Gibberlings3/Totemic_Cernd',
      readme: '',
      game: 'BG2',
      track: '',
      download: '',
      release: '2017-06-06',
      version: 'v3',
      sizeBytes: 12345,
      author: 'Gibberlings3',
      type: 'minor',
      stability: '',
    })
    expect(map.get('aTweaks')?.url).toBe('https://example.com/a,b')
    expect(map.get('aTweaks')?.category).toBe('TWEAKS')
    expect(map.get('aTweaks')?.readme).toBe('https://example.com/readme')
    expect(map.get('aTweaks')?.sizeBytes).toBe(1000808525)
    expect(map.get('aTweaks')?.author).toBe('Morpheus562')
    expect(map.get('aTweaks')?.type).toBe('major')
  })

  it('parses Name and Abbreviation when present', () => {
    const raw = [
      'Codename,Name,Abbreviation,Category,URL,Game,Track,Download,Release,Version,Size,Author,Readme,Type',
      'SotSC,"Shades of the Sword Coast",SotSC,QUEST,"https://x",BG1,,,2026-01-01,"v1",10,Lava,,compilation',
      'NoName,,,NPC,"https://x",BG2,,,2020-01-01,"v1",10,AuthorA,,',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('SotSC')?.name).toBe('Shades of the Sword Coast')
    expect(map.get('SotSC')?.abbreviation).toBe('SotSC')
    expect(map.get('NoName')?.name).toBe('')
    expect(map.get('NoName')?.abbreviation).toBe('')
  })

  it('treats missing Name and Abbreviation columns as empty string', () => {
    const raw = [
      'Codename,Category,URL,Game,Track,Download,Release,Version,Size,Author,Readme,Type',
      'Bare,NPC,"https://x",BG2,,,2020-01-01,"v1",10,AuthorA,,',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('Bare')?.name).toBe('')
    expect(map.get('Bare')?.abbreviation).toBe('')
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
      'Codename,Category,URL,Game,Track,Download,Release,Version,Size,Author',
      'NoReadmeCol,NPC,"https://x",BG2,,,2020-01-01,"v1",10,AuthorA,',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('NoReadmeCol')?.readme).toBe('')
    expect(map.get('NoReadmeCol')?.type).toBe('')
  })

  it('treats missing Category and Type columns as empty string', () => {
    const raw = [
      'Codename,URL,Game,Track,Download,Release,Version,Size,Author,Readme',
      'Bare,NPC,"https://x",BG2,,,2020-01-01,"v1",10,AuthorA,',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('Bare')?.category).toBe('')
    expect(map.get('Bare')?.type).toBe('')
  })

  it('parses Stability when present and defaults to empty', () => {
    const raw = [
      'Codename,Category,URL,Game,Track,Download,Release,Version,Stability,Size,Author,Readme,Type',
      'BetaMod,NPC,"https://x",BG2,,,2020-01-01,"v1",beta,10,AuthorA,,minor',
      'EmptyStab,NPC,"https://x",BG2,,,2020-01-01,"v1",,10,AuthorB,,minor',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('BetaMod')?.stability).toBe('beta')
    expect(map.get('EmptyStab')?.stability).toBe('')
  })

  it('treats missing Stability column as empty string', () => {
    const raw = [
      HEADER,
      'NoStabCol,NPC,"https://x",BG2,,,2020-01-01,"v1",10,AuthorA,,minor',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('NoStabCol')?.stability).toBe('')
  })
  it('parses Track and Download columns', () => {
    const raw = [
      HEADER,
      'Art,NPC,"https://x",BG2,main,,2020-01-01,"abc",10,A,,minor',
      'Asset,NPC,"https://x",BG2,,asset,2020-01-01,"v1",10,B,,minor',
      'Custom,NPC,"https://x",BG2,develop,,2020-01-01,"v1",10,C,,minor',
      'ReleaseZip,NPC,"https://x",BG2,release,zipball,2020-01-01,"v1",10,D,,minor',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('Art')?.track).toBe('main')
    expect(map.get('Art')?.download).toBe('')
    expect(map.get('Asset')?.track).toBe('')
    expect(map.get('Asset')?.download).toBe('asset')
    expect(map.get('Custom')?.track).toBe('develop')
    expect(map.get('Custom')?.download).toBe('')
    expect(map.get('ReleaseZip')?.track).toBe('')
    expect(map.get('ReleaseZip')?.download).toBe('')
  })

  it('maps legacy UseMaster and UseAssets columns', () => {
    const raw = [
      'Codename,Category,URL,Game,UseMaster,UseAssets,Release,Version,Size,Author,Readme,Type',
      'Art,NPC,"https://x",BG2,1,,2020-01-01,"abc",10,A,,minor',
      'Asset,NPC,"https://x",BG2,,1,2020-01-01,"v1",10,B,,minor',
      'Both,NPC,"https://x",BG2,1,true,2020-01-01,"v1",10,C,,minor',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('Art')?.track).toBe('main')
    expect(map.get('Art')?.download).toBe('')
    expect(map.get('Asset')?.track).toBe('')
    expect(map.get('Asset')?.download).toBe('asset')
    expect(map.get('Both')?.track).toBe('main')
    expect(map.get('Both')?.download).toBe('')
  })

  it('coerces Download=asset off when Track is a branch', () => {
    const raw = [
      HEADER,
      'Bad,NPC,"https://x",BG2,main,asset,2020-01-01,"v1",10,A,,minor',
    ].join('\n')
    const map = parseModsCsv(raw)
    expect(map.get('Bad')?.track).toBe('main')
    expect(map.get('Bad')?.download).toBe('')
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

  it('splits co-author cells when counting', () => {
    const rows = [
      HEADER,
      'a,NPC,"https://x",BG2,,,2020-01-01,"v1",1,"Lava, Kaeloree",,',
      'b,NPC,"https://x",BG2,,,2020-01-01,"v1",1,"Lava, Kaeloree",,',
      'c,NPC,"https://x",BG2,,,2020-01-01,"v1",1,Lava,,',
      'd,NPC,"https://x",BG2,,,2020-01-01,"v1",1,Solo,,',
    ]
    const map = parseModsCsv(rows.join('\n'))
    expect(collectAuthorOptions(map, 3)).toEqual([
      { name: 'Lava', count: 3 },
    ])
    expect(collectAuthorOptions(map, 2)).toEqual([
      { name: 'Lava', count: 3 },
      { name: 'Kaeloree', count: 2 },
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

describe('countSelectedMods', () => {
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

  function modelWithComponents(...comps: TreeNode[]): InstallSequenceModel {
    const components = comps.filter((n) => n.kind === 'component') as ComponentNode[]
    const nodesByKey = new Map(comps.map((n) => [n.key, n]))
    return {
      stations: [],
      componentsById: new Map(components.map((c) => [c.componentId, c])),
      componentsInOrder: components,
      nodesByKey,
    }
  }

  it('counts multiple components under one mod as one', () => {
    const a = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: 'a:1',
      orderIndex: 0,
      parentKey: 'm1',
    } as TreeNode)
    const b = node({
      key: 'c2',
      tag: 'component',
      kind: 'component',
      componentId: 'a:2',
      orderIndex: 1,
      parentKey: 'm1',
    } as TreeNode)
    const mod = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'EEex' },
      children: [a, b],
    })
    const model = modelWithComponents(mod, a, b)
    expect(countSelectedMods(model, new Set(['a:1', 'a:2']))).toBe(1)
    expect(listSelectedModCodenames(model, new Set(['a:1', 'a:2']))).toEqual([
      'EEex',
    ])
  })

  it('counts distinct modIds as separate mods', () => {
    const a = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: 'x:1',
      orderIndex: 0,
      attrs: { modId: 'ModA' },
    } as TreeNode)
    const b = node({
      key: 'c2',
      tag: 'component',
      kind: 'component',
      componentId: 'y:1',
      orderIndex: 1,
      attrs: { modId: 'ModB' },
    } as TreeNode)
    const model = modelWithComponents(a, b)
    expect(countSelectedMods(model, new Set(['x:1', 'y:1']))).toBe(2)
  })

  it('counts orphan components via componentId', () => {
    const orphan = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: 'orphan:1',
      orderIndex: 0,
    } as TreeNode)
    const model = modelWithComponents(orphan)
    expect(countSelectedMods(model, new Set(['orphan:1']))).toBe(1)
  })

  it('returns 0 for empty selection', () => {
    const a = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: 'x:1',
      orderIndex: 0,
      attrs: { modId: 'ModA' },
    } as TreeNode)
    expect(countSelectedMods(modelWithComponents(a), new Set())).toBe(0)
  })
})

describe('buildModComponentCatalogStats', () => {
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

  function modelWithComponents(...comps: TreeNode[]): InstallSequenceModel {
    const components = comps.filter((n) => n.kind === 'component') as ComponentNode[]
    const nodesByKey = new Map(comps.map((n) => [n.key, n]))
    return {
      stations: [],
      componentsById: new Map(components.map((c) => [c.componentId, c])),
      componentsInOrder: components,
      nodesByKey,
    }
  }

  it('counts catalog and checked components per mod codename', () => {
    const a = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: 'a:1',
      orderIndex: 0,
      attrs: { modId: 'ModA' },
    } as TreeNode)
    const b = node({
      key: 'c2',
      tag: 'component',
      kind: 'component',
      componentId: 'a:2',
      orderIndex: 1,
      attrs: { modId: 'ModA' },
    } as TreeNode)
    const c = node({
      key: 'c3',
      tag: 'component',
      kind: 'component',
      componentId: 'b:1',
      orderIndex: 2,
      attrs: { modId: 'ModB' },
    } as TreeNode)
    const model = modelWithComponents(a, b, c)
    const stats = buildModComponentCatalogStats(model, new Set(['a:1']))
    expect(stats.get('ModA')).toEqual({ catalogCount: 2, checkedCount: 1 })
    expect(stats.get('ModB')).toEqual({ catalogCount: 1, checkedCount: 0 })
    expect(modCodenamesWithCatalogComponents(model)).toEqual(['ModA', 'ModB'])
  })

  it('includes hidden selection in checked count', () => {
    const hidden = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: 'hidden:1',
      orderIndex: 0,
      attrs: { modId: 'HiddenMod' },
    } as TreeNode)
    const model = modelWithComponents(hidden)
    const stats = buildModComponentCatalogStats(model, new Set(['hidden:1']))
    expect(stats.get('HiddenMod')).toEqual({ catalogCount: 1, checkedCount: 1 })
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

describe('resolveModStability', () => {
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
      'Codename,Category,URL,Game,Track,Download,Release,Version,Stability,Size,Author,Readme,Type',
      'BetaMod,NPC,"https://x",BG2,,,2020-01-01,"v1",beta,10,A,,minor',
      'AlphaMod,NPC,"https://x",BG2,,,2020-01-01,"v1",alpha,10,A,,minor',
      'ReleasedMod,NPC,"https://x",BG2,,,2020-01-01,"v1",,10,A,,minor',
    ].join('\n'),
  )

  it('uses component modId when present', () => {
    const comp = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
      attrs: { modId: 'BetaMod' },
    } as TreeNode)
    expect(resolveModStability(modelWith(comp), modsByCodename, comp)).toBe('beta')
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
      attrs: { id: 'AlphaMod' },
      children: [comp],
    })
    expect(resolveModStability(modelWith(mod, comp), modsByCodename, comp)).toBe(
      'alpha',
    )
  })

  it('returns undefined when lookup key or catalog stability is missing', () => {
    const orphan = node({
      key: 'c1',
      tag: 'component',
      kind: 'component',
      componentId: '0',
      orderIndex: 0,
    } as TreeNode)
    expect(
      resolveModStability(modelWith(orphan), modsByCodename, orphan),
    ).toBeUndefined()

    const released = node({
      key: 'm1',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'ReleasedMod' },
    })
    expect(
      resolveModStability(modelWith(released), modsByCodename, released),
    ).toBeUndefined()

    const unknown = node({
      key: 'm2',
      tag: 'mod',
      kind: 'container',
      attrs: { id: 'MissingMod' },
    })
    expect(
      resolveModStability(modelWith(unknown), modsByCodename, unknown),
    ).toBeUndefined()
  })
})
