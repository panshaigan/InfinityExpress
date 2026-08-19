import { describe, expect, it } from 'vitest'
import {
  applyWeiduLogToSteps,
  importInstalledFromDestinations,
  mapLogEntriesToComponents,
  persistedWeiduLogInstallsFrom,
  persistedWeiduLogToImport,
  mergeWeiduLogImports,
  weiduLogImportMessage,
  weiduLogImportToPersisted,
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

function eefpHit(phase: 'eet1' | 'eet') {
  const gameDir = phase === 'eet1' ? 'D:/games/bg1' : 'D:/games/bg2'
  return {
    componentId: 'cd_eefp_core_fixes',
    tp2Path: 'eefixpack/eefixpack.tp2',
    absoluteTp2Path: `${gameDir}/eefixpack/eefixpack.tp2`,
    stagedFolderName: 'eefixpack',
    weiduNumber: 0,
    languageIndex: 0,
    phase,
  }
}

function eefpDualSteps(): InstallStep[] {
  return (['eet1', 'eet'] as const).map((phase, i) => ({
    stepId: `${phase}:${String(i).padStart(4, '0')}`,
    phase,
    modId: 'EE_Fixpack',
    tp2Path: '',
    stagedFolderName: '',
    componentId: 'cd_eefp_core_fixes',
    componentLabel: 'Core fixes',
    weiduNumber: null,
    languageIndex: null,
    status: 'queued' as const,
    warnings: [],
    errors: [],
    resultLines: [],
  }))
}

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

  it('matches LABEL case-insensitively', () => {
    const model = modelWith([dlcMerger])
    const entries = parseWeiduLog('~DLCMERGER/DLCMERGER.TP2~ #0 #1')
    const listings = new Map([
      [
        'dlcmerger/dlcmerger.tp2',
        [
          {
            index: 0,
            number: 1,
            name: 'Merge SoD',
            label: ['a7-dlcmerger-merge_sod'],
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

  it('maps an eet1 LABEL from the BG2 log (no export-phase filter)', () => {
    const model = modelWith([dlcMerger])
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
    const { hits, unmatched } = mapLogEntriesToComponents(
      model,
      'eet',
      'eet',
      'D:/games/bg2',
      entries,
      listings,
    )
    expect(unmatched).toEqual([])
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

  it('surfaces listing failures instead of swallowing them', async () => {
    const model = modelWith([dlcMerger])
    const result = await importInstalledFromDestinations(
      model,
      'eet',
      {
        bg1: 'D:/games/bg1-fail',
        bg2: 'D:/games/bg2-fail',
        iwd: '',
        pst: '',
      },
      {
        weiduPath: 'C:/weidu.exe',
        readLog: async (dir) =>
          dir.includes('bg1-fail') ? '~DLCMERGER/DLCMERGER.TP2~ #0 #1\n' : '',
        listComponents: async () => {
          throw new Error('weidu exited 1')
        },
      },
    )
    expect(result.componentIds.size).toBe(0)
    expect(result.listingErrors.some((e) => e.includes('weidu exited 1'))).toBe(
      true,
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
      listingErrors: [],
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
      listingErrors: [],
      hits: [],
    })
    expect(marked[0]?.status).toBe('queued')
  })

  it('does not unmark when the scan result is still in flight', () => {
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
    expect(applyWeiduLogToSteps([step], null)[0]?.status).toBe('alreadyInstalled')
  })

  it('marks a later-added plan step from persisted hits', () => {
    const persisted = {
      hasLog: true,
      unmatched: [],
      componentIds: new Set(['A7-DLCMERGER-MERGE_SOD']),
      listingErrors: [],
      hits: [
        {
          componentId: 'A7-DLCMERGER-MERGE_SOD',
          tp2Path: 'DLCMERGER/DLCMERGER.TP2',
          absoluteTp2Path: 'D:/games/bg1/DLCMERGER/DLCMERGER.TP2',
          stagedFolderName: 'DLCMERGER',
          weiduNumber: 1,
          languageIndex: 0,
          phase: 'eet1' as const,
        },
      ],
    }
    const step: InstallStep = {
      stepId: 'eet1:0000',
      phase: 'eet1' as const,
      modId: 'A7-DlcMerger',
      tp2Path: '',
      stagedFolderName: '',
      componentId: 'A7-DLCMERGER-MERGE_SOD',
      componentLabel: 'Merge SoD DLC',
      weiduNumber: null,
      languageIndex: null,
      status: 'queued' as const,
      warnings: [],
      errors: [],
      resultLines: [],
    }
    const marked = applyWeiduLogToSteps([step], persisted)
    expect(marked[0]).toMatchObject({
      status: 'alreadyInstalled',
      weiduNumber: 1,
      stagedFolderName: 'DLCMERGER',
    })
  })

  it('marks only the eet1 step when the id is in the BG1 log', () => {
    const marked = applyWeiduLogToSteps(eefpDualSteps(), {
      hasLog: true,
      unmatched: [],
      componentIds: new Set(['cd_eefp_core_fixes']),
      listingErrors: [],
      hits: [eefpHit('eet1')],
    })
    expect(marked[0]?.status).toBe('alreadyInstalled')
    expect(marked[0]?.tp2Path).toBe('D:/games/bg1/eefixpack/eefixpack.tp2')
    expect(marked[1]?.status).toBe('queued')
  })

  it('marks only the eet step when the id is in the BG2 log', () => {
    const marked = applyWeiduLogToSteps(eefpDualSteps(), {
      hasLog: true,
      unmatched: [],
      componentIds: new Set(['cd_eefp_core_fixes']),
      listingErrors: [],
      hits: [eefpHit('eet')],
    })
    expect(marked[0]?.status).toBe('queued')
    expect(marked[1]?.status).toBe('alreadyInstalled')
    expect(marked[1]?.tp2Path).toBe('D:/games/bg2/eefixpack/eefixpack.tp2')
  })

  it('marks both phases from their own logs with the matching tp2 path', () => {
    const marked = applyWeiduLogToSteps(eefpDualSteps(), {
      hasLog: true,
      unmatched: [],
      componentIds: new Set(['cd_eefp_core_fixes']),
      listingErrors: [],
      hits: [eefpHit('eet1'), eefpHit('eet')],
    })
    expect(marked[0]).toMatchObject({
      status: 'alreadyInstalled',
      tp2Path: 'D:/games/bg1/eefixpack/eefixpack.tp2',
    })
    expect(marked[1]).toMatchObject({
      status: 'alreadyInstalled',
      tp2Path: 'D:/games/bg2/eefixpack/eefixpack.tp2',
    })
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

describe('persisted WeiDU.log installs', () => {
  it('round-trips identified hits', () => {
    const result = {
      hasLog: true,
      unmatched: [],
      listingErrors: [],
      componentIds: new Set(['A7-DLCMERGER-MERGE_SOD']),
      hits: [
        {
          componentId: 'A7-DLCMERGER-MERGE_SOD',
          tp2Path: 'DLCMERGER/DLCMERGER.TP2',
          absoluteTp2Path: 'D:/games/bg1/DLCMERGER/DLCMERGER.TP2',
          stagedFolderName: 'DLCMERGER',
          weiduNumber: 1,
          languageIndex: 0,
          phase: 'eet1' as const,
        },
      ],
    }
    const persisted = weiduLogImportToPersisted(result)
    const json = JSON.parse(JSON.stringify(persisted)) as unknown
    const parsed = persistedWeiduLogInstallsFrom(json)
    const restored = persistedWeiduLogToImport(parsed)
    expect(restored?.componentIds.has('A7-DLCMERGER-MERGE_SOD')).toBe(true)
    expect(restored?.hits[0]?.weiduNumber).toBe(1)
  })

  it('keeps persisted LABEL hits when a later scan cannot list them', () => {
    const previous = persistedWeiduLogToImport({
      hasLog: true,
      componentIds: ['A7-DLCMERGER-MERGE_SOD'],
      hits: [
        {
          componentId: 'A7-DLCMERGER-MERGE_SOD',
          tp2Path: 'DLCMERGER/DLCMERGER.TP2',
          absoluteTp2Path: 'D:/games/bg1/DLCMERGER/DLCMERGER.TP2',
          stagedFolderName: 'DLCMERGER',
          weiduNumber: 1,
          languageIndex: 0,
          phase: 'eet1',
        },
      ],
    })
    const live: Parameters<typeof mergeWeiduLogImports>[1] = {
      hasLog: true,
      unmatched: [],
      listingErrors: ['WeiDU.exe is not set — labelled components were not mapped from WeiDU.log'],
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
    }
    const merged = mergeWeiduLogImports(previous, live)
    expect([...merged.componentIds].sort()).toEqual([
      'A7-DLCMERGER-MERGE_SOD',
      'EEex:1',
    ])
  })

  it('keeps both phases when merging the same component id', () => {
    const previous = persistedWeiduLogToImport({
      hasLog: true,
      componentIds: ['cd_eefp_core_fixes'],
      hits: [eefpHit('eet1')],
    })
    const live: Parameters<typeof mergeWeiduLogImports>[1] = {
      hasLog: true,
      unmatched: [],
      listingErrors: [],
      componentIds: new Set(['cd_eefp_core_fixes']),
      hits: [eefpHit('eet')],
    }
    const merged = mergeWeiduLogImports(previous, live)
    expect(merged.hits.map((h) => h.phase).sort()).toEqual(['eet', 'eet1'])
    expect(
      merged.hits.find((h) => h.phase === 'eet1')?.absoluteTp2Path,
    ).toContain('/bg1/')
    expect(
      merged.hits.find((h) => h.phase === 'eet')?.absoluteTp2Path,
    ).toContain('/bg2/')
  })
})
