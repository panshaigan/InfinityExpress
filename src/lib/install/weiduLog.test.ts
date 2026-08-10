import { describe, expect, it } from 'vitest'
import { isComponentInstalledInLog, parseWeiduLogLine } from './weiduLog'
import { resolveComponentNumber } from './weiduResolution'
import type { ComponentNode } from '../xml/schema'

describe('weiduLog', () => {
  it('parses install lines', () => {
    const entry = parseWeiduLogLine('~my-mod/setup-my-mod.tp2~ #0 #12')
    expect(entry).toEqual({
      tp2Path: 'my-mod/setup-my-mod.tp2',
      languageIndex: 0,
      componentNumber: 12,
      raw: '~my-mod/setup-my-mod.tp2~ #0 #12',
    })
  })

  it('matches installed components', () => {
    const log = '~foo/setup-foo.tp2~ #0 #1\n~foo/setup-foo.tp2~ #0 #2\n'
    expect(isComponentInstalledInLog(log, 'foo/setup-foo.tp2', 0, 2)).toBe(true)
    expect(isComponentInstalledInLog(log, 'foo/setup-foo.tp2', 0, 9)).toBe(false)
  })
})

describe('resolveComponentNumber', () => {
  const component: ComponentNode = {
    key: 'EEex:1',
    tag: 'component',
    kind: 'component',
    componentId: 'EEex:1',
    orderIndex: 0,
    attrs: { id: 'EEex:1', label: 'EEex', name: 'EEex core' },
    effectiveEngine: '',
    children: [],
  }

  it('resolves numeric suffix', () => {
    const result = resolveComponentNumber(component, [
      { index: 0, number: 1, name: 'EEex core', label: [] },
    ])
    expect(result.weiduNumber).toBe(1)
  })

  it('resolves WeiDU LABEL from component id', () => {
    const dlc: ComponentNode = {
      key: 'A7-DLCMERGER-MERGE_SOD',
      tag: 'component',
      kind: 'component',
      componentId: 'A7-DLCMERGER-MERGE_SOD',
      orderIndex: 0,
      attrs: {
        id: 'A7-DLCMERGER-MERGE_SOD',
        label: 'Merge SoD DLC',
        name: 'Merge "Siege of Dragonspear" DLC',
        modId: 'A7-DlcMerger',
      },
      effectiveEngine: '',
      children: [],
    }
    const result = resolveComponentNumber(dlc, [
      {
        index: 0,
        number: 1,
        name: 'Merge "Siege of Dragonspear" DLC',
        label: ['A7-DLCMERGER-MERGE_SOD'],
      },
    ])
    expect(result).toEqual({ weiduNumber: 1, error: null })
  })
})
