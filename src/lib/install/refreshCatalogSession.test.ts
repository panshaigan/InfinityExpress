import { describe, expect, it } from 'vitest'
import { refreshCatalogSession } from './refreshCatalogSession'
import { buildInstallPlan } from './planBuilder'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { buildPersistedInstallSession, sanitizeInstallSession } from '../ui/appSessionPrefs'
import type { SelectedGame } from '../xml/schema'

function savedSession(xml: string, ids: string[], game: SelectedGame = 'bg2') {
  return buildPersistedInstallSession({
    game, selectedIds: new Set(ids),
    run: {
      runId: 'history', game, logDir: '/history/run', cursor: 1, runState: 'paused',
      steps: buildInstallPlan(parseInstallSequence(xml).model, new Set(ids), game).map((step, index) => ({
        ...step, tp2Path: `/games/${step.phase}/mod/mod.tp2`, stagedFolderName: 'mod', weiduNumber: index, languageIndex: 0,
        status: index === 0 ? 'succeeded' as const : 'queued' as const,
        stdoutLogPath: `/history/${step.phase}-${step.componentId}.log`,
      })),
      breakpointStepIds: ['single:0001'], plannedSnapshots: [{ stepId: 'single:0001', name: 'before B' }],
    },
    paused: true, selectedStepId: 'single:0001', selectedComponentId: 'b:0', hideInstalled: false,
    pauseOnWarnings: true, autoSkipOnErrors: false, followCursor: true, runElapsedMs: 100,
  })
}

describe('canonical install plan refresh', () => {
  it('updates labels and order while retaining matching history and remapping controls to their components', () => {
    const saved = savedSession('<installSequence><base><mod id="download"><component id="a:0"/><component id="b:0"/></mod></base></installSequence>', ['a:0', 'b:0'])
    const model = parseInstallSequence('<installSequence><base><mod id="download"><component id="b:0" label="New B"/><component id="new:0"/><component id="a:0" label="New A"/></mod></base></installSequence>').model
    const selected = new Set(['a:0', 'b:0', 'new:0'])
    const refreshed = refreshCatalogSession(model, 'bg2', selected, saved)
    expect(refreshed.run.steps.map(step => [step.componentId, step.componentLabel, step.status])).toEqual([
      ['b:0', 'New B', 'queued'], ['new:0', 'new:0', 'queued'], ['a:0', 'New A', 'succeeded'],
    ])
    expect(refreshed.run.steps[2].stdoutLogPath).toBe(saved.run.steps[0].stdoutLogPath)
    expect(refreshed.run.steps[2].tp2Path).toBe(saved.run.steps[0].tp2Path)
    expect(refreshed.run.breakpointStepIds).toEqual(['single:0000'])
    expect(refreshed.run.plannedSnapshots).toEqual([{ stepId: 'single:0000', name: 'before B' }])
    expect(refreshed.ui.selectedStepId).toBe('single:0000')
    expect(refreshed.run.cursor).toBe(0)
    expect(refreshed.run.runState).toBe('paused')
    expect(sanitizeInstallSession(model, 'bg2', selected, refreshed)).toEqual(refreshed)
    expect(saved.run.steps[0].componentId).toBe('a:0')
  })

  it('keeps separate EET phase histories and queues a component moved to a different download', () => {
    const oldXml = '<installSequence><base><component id="shared:0" modId="original" engine="eet1,eet"/></base></installSequence>'
    const saved = savedSession(oldXml, ['shared:0'], 'eet')
    const unchanged = refreshCatalogSession(parseInstallSequence(oldXml).model, 'eet', new Set(['shared:0']), saved)
    expect(unchanged.run.steps.map(step => [step.phase, step.status, step.tp2Path])).toEqual([
      ['eet1', 'succeeded', '/games/eet1/mod/mod.tp2'], ['eet', 'queued', '/games/eet/mod/mod.tp2'],
    ])
    const model = parseInstallSequence('<installSequence><base><component id="shared:0" modId="replacement" engine="eet"/></base></installSequence>').model
    const refreshed = refreshCatalogSession(model, 'eet', new Set(['shared:0']), saved)
    expect(refreshed.run.steps).toHaveLength(1)
    expect(refreshed.run.steps[0]).toMatchObject({ phase: 'eet', modId: 'replacement', status: 'queued', tp2Path: '', weiduNumber: null })
    expect(refreshed.run.steps[0].stdoutLogPath).toBeUndefined()
    expect(() => refreshCatalogSession(model, 'bg2', new Set(['shared:0']), saved)).toThrow('different engine')
  })
})
