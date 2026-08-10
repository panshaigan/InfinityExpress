import { describe, expect, it } from 'vitest'
import { isComponentInstalledInLog, parseWeiduLogLine } from './weiduLog'
import { pickEnglishLanguage, resolveComponentNumber } from './weiduResolution'
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

describe('pickEnglishLanguage', () => {
  it('prefers English when present', () => {
    expect(
      pickEnglishLanguage([
        { index: 0, name: 'French' },
        { index: 1, name: 'English' },
      ]),
    ).toEqual({ language: { index: 1, source: 'auto' }, error: null })
  })

  it('falls back to the first language when English is absent', () => {
    expect(
      pickEnglishLanguage([
        { index: 0, name: 'None' },
        { index: 1, name: 'French' },
      ]),
    ).toEqual({ language: { index: 0, source: 'auto' }, error: null })
  })

  it('errors only when no languages are listed', () => {
    expect(pickEnglishLanguage([])).toEqual({
      language: null,
      error: 'No languages listed for mod tp2',
    })
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

describe('tp2SearchHintFromComponentId', () => {
  it('extracts folder hint from numbered component ids', async () => {
    const { tp2SearchHintFromComponentId } = await import('./modResolution')
    expect(tp2SearchHintFromComponentId('bubb_revert_pathfinding:0')).toBe(
      'bubb_revert_pathfinding',
    )
    expect(tp2SearchHintFromComponentId('EEex:1')).toBe('EEex')
    expect(tp2SearchHintFromComponentId('A7-DLCMERGER-MERGE_SOD')).toBeNull()
  })
})
