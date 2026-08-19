import { describe, expect, it } from 'vitest'
import {
  applyWeiduLogToSteps,
  importInstalledFromDestinations,
  mapLogEntriesToComponents,
  weiduLogImportMessage,
} from './weiduLogMap'
import { parseWeiduLog } from './weiduLog'
import { selectionFromInstalledIds } from '../selection/selectionEngine'
import type { ComponentNode, InstallSequenceModel } from '../xml/schema'
import type { InstallStep } from './types'

function comp(
  id: string,
  attrs: ComponentNode['attrs'] = {},
  engine = '',
): ComponentNode {
  return {
    key: id,
    tag: 'component',
    kind: 'component',
    componentId: id,
    orderIndex: 0,
    attrs: { id, ...attrs },
    effectiveEngine: engine,
    children: [],
  }
}

function modelWith(components: ComponentNode[]): InstallSequenceModel {
  const numbered = components.map((c, i) => ({ ...c, orderIndex: i }))
  return {
    stations: [],
    componentsById: new Map(numbered.map((c) => [c.componentId, c])),
    componentsInOrder: numbered,
    nodesByKey: new Map(numbered.map((c) => [c.key, c])),
  }
}

const dlcMerger = comp(
  'A7-DLCMERGER-MERGE_SOD',
  {
    id: 'A7-DLCMERGER-MERGE_SOD',
    label: 'Merge SoD DLC',
    name: 'Merge "Siege of Dragonspear" DLC',
    modId: 'A7-DlcMerger',
  },
  'bg1,eet1',
)

const eeex = comp('EEex:1', { id: 'EEex:1', modId: 'EEex', name: 'EEex core' }, 'eet')

const tweaks = comp(
  'cd_tweaks_adjust_evil_npc_reactions',
  {
    id: 'cd_tweaks_adjust_evil_npc_reactions',
    modId: 'Tweaks-Anthology',
  },
  'eet',
)

describe('mapLogEntriesToComponents', () => {
  it('maps numbered folder:N ids without a listing', () => {
    const model = modelWith([eeex])
    const entries = parseWeiduLog('~EEex/EEex.tp2~ #0 #1')
    const { hits, unmatched } = mapLogEntriesToComponents(
      model,
      'eet',
      'eet',
      'D:/games/bg2',
      entries,
      new Map(),
    )
    expect(unmatched).toEqual([])
    expect(hits).toMatchObject([
      {
        componentId: 'EEex:1',
        weiduNumber: 1,
        stagedFolderName: 'EEex',
        languageIndex: 0,
      },
    ])
  })

  it('matches tp2 folder case-insensitively', () => {
    const model = modelWith([eeex])
    const entries = parseWeiduLog('~eeex/setup-eeex.tp2~ #0 #1')
    const { hits } = mapLogEntriesToComponents(
      model,
      'eet',
      'eet',
      'D:/games/bg2',
      entries,
      new Map(),
    )
    expect(hits[0]?.componentId).toBe('EEex:1')
  })

  it('maps DLC Merger LABEL via listing invert', () => {
    const model = modelWith([dlcMerger, eeex])
    const entries = parseWeiduLog(
      '~DLCMERGER/DLCMERGER.TP2~ #0 #1 // Merge DLC into game -> Merge "Siege of Dragonspear" DLC: 2.1',
    )
    const listings = new Map([
      [
        'dlcmerger/dlcmerger.tp2',
        [
          {
            index: 0,
            number: 1,
            name: 'Merge "Siege of Dragonspear" DLC',
            label: ['A7-DLCMERGER-MERGE_SOD'],
          },
        ],
      ],
    ])
    const { hits, unmatched } = mapLogEntriesToComponents(
      model,
      'eet',
      'eet1',
      'D:/games/bg1',
      entries,
      listings,
    )
    expect(unmatched).toEqual([])
    expect(hits.map((h) => h.componentId)).toEqual(['A7-DLCMERGER-MERGE_SOD'])
  })

  it('does not let a numbered id steal another mod\'s component number', () => {
    const model = modelWith([eeex, dlcMerger])
    const entries = parseWeiduLog('~DLCMERGER/DLCMERGER.TP2~ #0 #1')
    const listings = new Map([
      [
        'dlcmerger/dlcmerger.tp2',
        [
          {
            index: 0,
            number: 1,
            name: 'Merge SoD',
            label: ['A7-DLCMERGER-MERGE_SOD'],
          },
        ],
      ],
    ])
    const { hits } = mapLogEntriesToComponents(
      model,
      'eet',
      'eet1',
      'D:/games/bg1',
      entries,
      listings,
    )
    expect(hits.map((h) => h.componentId)).toEqual(['A7-DLCMERGER-MERGE_SOD'])
  })

  it('leaves unknown mods unmatched', () => {
    const model = modelWith([eeex])
    const entries = parseWeiduLog('~mystery/setup-mystery.tp2~ #0 #3')
    const { hits, unmatched } = mapLogEntriesToComponents(
      model,
      'eet',
      'eet',
      'D:/games/bg2',
      entries,
      new Map(),
    )
    expect(hits).toEqual([])
    expect(unmatched).toHaveLength(1)
  })
})

describe('importInstalledFromDestinations', () => {
  it('lists leftover tp2s and maps LABELs', async () => {
    const model = modelWith([dlcMerger, tweaks])
    const result = await importInstalledFromDestinations(
      model,
      'eet',
      {
        bg1: 'D:/games/bg1',
        bg2: 'D:/games/bg2',
        iwd: '',
        pst: '',
      },
      {
        weiduPath: 'C:/weidu.exe',
        readLog: async (dir) => {
          if (dir.includes('bg1')) {
            return '~DLCMERGER/DLCMERGER.TP2~ #0 #1\n'
          }
          return ''
        },
        listComponents: async (_weidu, tp2) => {
          expect(tp2.toLowerCase()).toContain('dlcmerger')
          return [
            {
              index: 0,
              number: 1,
              name: 'Merge SoD',
              label: ['A7-DLCMERGER-MERGE_SOD'],
            },
          ]
        },
      },
    )
    expect(result.hasLog).toBe(true)
    expect([...result.componentIds]).toEqual(['A7-DLCMERGER-MERGE_SOD'])
    expect(weiduLogImportMessage(result)).toBe(
      'Checked 1 installed component from WeiDU.log.',
    )
  })
})

describe('applyWeiduLogToSteps', () => {
  it('marks queued steps alreadyInstalled and fills tp2 fields', () => {
    const step: InstallStep = {
      stepId: 'eet:0000',
      phase: 'eet',
      modId: 'EEex',
      tp2Path: '',
      stagedFolderName: '',
      componentId: 'EEex:1',
      componentLabel: 'EEex',
      weiduNumber: null,
      languageIndex: null,
      status: 'queued',
      warnings: [],
      errors: [],
      resultLines: [],
    }
    const marked = applyWeiduLogToSteps([step], {
      hasLog: true,
      unmatched: [],
      componentIds: new Set(['EEex:1']),
      hits: [
        {
          componentId: 'EEex:1',
          tp2Path: 'EEex/EEex.tp2',
          absoluteTp2Path: 'D:/games/bg2/EEex/EEex.tp2',
          stagedFolderName: 'EEex',
          weiduNumber: 1,
          languageIndex: 0,
          phase: 'eet',
        },
      ],
    })
    expect(marked[0]).toMatchObject({
      status: 'alreadyInstalled',
      tp2Path: 'D:/games/bg2/EEex/EEex.tp2',
      weiduNumber: 1,
      languageIndex: 0,
      stagedFolderName: 'EEex',
    })
  })

  it('clears alreadyInstalled when the component is no longer in the log', () => {
    const step: InstallStep = {
      stepId: 'eet:0000',
      phase: 'eet',
      modId: 'EEex',
      tp2Path: 'D:/games/bg2/EEex/EEex.tp2',
      stagedFolderName: 'EEex',
      componentId: 'EEex:1',
      componentLabel: 'EEex',
      weiduNumber: 1,
      languageIndex: 0,
      status: 'alreadyInstalled',
      warnings: [],
      errors: [],
      resultLines: [],
    }
    const marked = applyWeiduLogToSteps([step], {
      hasLog: false,
      unmatched: [],
      componentIds: new Set(),
      hits: [],
    })
    expect(marked[0]?.status).toBe('queued')
  })
})

describe('selectionFromInstalledIds', () => {
  it('keeps required ids and adds mapped ones', () => {
    const required = comp('req', { id: 'req', required: true }, 'eet')
    const extra = comp('EEex:1', { id: 'EEex:1' }, 'eet')
    const model = modelWith([required, extra])
    const selected = selectionFromInstalledIds(model, 'eet', new Set(['EEex:1']))
    expect(selected.has('req')).toBe(true)
    expect(selected.has('EEex:1')).toBe(true)
  })
})
