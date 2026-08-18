import { describe, expect, it } from 'vitest'
import {
  APP_SESSION_STORAGE_KEY,
  buildGameSessionSnapshot,
  buildPersistedInstallSession,
  buildPlanFingerprint,
  emptyAppSession,
  mergeAppSession,
  normalizeInstallRunForPersist,
  readAppSession,
  sanitizeComponentsSession,
  sanitizeInstallSession,
  writeAppSession,
  type GameSession,
  type PersistedInstallSession,
} from './appSessionPrefs'
import type { InstallRun } from '../install/types'
import type { SelectedGame } from '../xml/schema'

function makeRun(game: SelectedGame = 'bg2'): InstallRun {
  return {
    runId: 'run-test',
    game,
    logDir: 'D:/backups/projects/proj-test/logs/run-test',
    cursor: 1,
    runState: 'running',
    breakpointStepIds: ['single:0000'],
    plannedSnapshots: [{ stepId: 'single:0001', name: 'before-tweaks' }],
    steps: [
      {
        stepId: 'single:0000',
        phase: 'single',
        modId: 'ModA',
        tp2Path: '',
        stagedFolderName: '',
        componentId: 'comp-a',
        componentLabel: 'Comp A',
        weiduNumber: null,
        languageIndex: null,
        status: 'succeeded',
        warnings: [],
        errors: [],
        resultLines: ['ok'],
        startedAt: '2026-01-01T10:00:00.000Z',
        finishedAt: '2026-01-01T10:01:00.000Z',
      },
      {
        stepId: 'single:0001',
        phase: 'single',
        modId: 'ModB',
        tp2Path: '',
        stagedFolderName: '',
        componentId: 'comp-b',
        componentLabel: 'Comp B',
        weiduNumber: null,
        languageIndex: null,
        status: 'installing',
        warnings: [],
        errors: [],
        resultLines: [],
      },
    ],
  }
}

describe('appSessionPrefs', () => {
  it('round-trips via localStorage without console keys', () => {
    const store = mergeAppSession(
      emptyAppSession(),
      'bg2',
      buildGameSessionSnapshot({
        selectedIds: new Set(['a', 'b']),
        finishedStations: new Set(['engine']),
        routeUnlocked: true,
        selectionPresets: [],
        activePresetId: null,
        presetBaseline: null,
        activeStation: 'base',
        contentMainKey: null,
        contentSubKey: null,
        contentSubTag: null,
        recommendedChecked: new Set(['fixes']),
        packagesChecked: new Set(),
        modsJourney: null,
      }),
      'components',
    )
    writeAppSession(store)
    const raw = window.localStorage.getItem(APP_SESSION_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('consoleLines')
    expect(readAppSession().lastGame).toBe('bg2')
    window.localStorage.removeItem(APP_SESSION_STORAGE_KEY)
  })

  it('buildPlanFingerprint is stable for set order', () => {
    const a = buildPlanFingerprint('eet', new Set(['z', 'a']))
    const b = buildPlanFingerprint('eet', new Set(['a', 'z']))
    expect(a).toBe(b)
  })

  it('normalizeInstallRunForPersist pauses running and clears in-flight steps', () => {
    const normalized = normalizeInstallRunForPersist(makeRun())
    expect(normalized.runState).toBe('paused')
    expect(normalized.steps[1]?.status).toBe('queued')
    expect(normalized.steps[0]?.status).toBe('succeeded')
  })

  it('sanitizeInstallSession rejects plan fingerprint mismatch', () => {
    const install: PersistedInstallSession = buildPersistedInstallSession({
      game: 'bg2',
      selectedIds: new Set(['x']),
      run: makeRun('bg2'),
      paused: true,
      selectedStepId: 'single:0000',
      selectedComponentId: 'comp-a',
      hideInstalled: false,
      runElapsedMs: 1000,
    })
    const model = {
      componentsInOrder: [],
      stations: [],
      componentsById: {},
      nodesByKey: {},
    } as unknown as import('../xml/schema').InstallSequenceModel
    expect(
      sanitizeInstallSession(model, 'bg2', new Set(['y']), install),
    ).toBeUndefined()
  })

  it('sanitizeComponentsSession drops unknown component ids', () => {
    const session: GameSession = {
      selectedIds: ['known', 'unknown'],
      finishedStations: ['engine'],
      routeUnlocked: true,
      selectionPresets: [],
      activePresetId: 'missing',
      presetBaseline: 'fp',
      activeStation: 'engine',
      contentMainKey: null,
      contentSubKey: null,
      contentSubTag: null,
      recommendedChecked: [],
      packagesChecked: [],
      modsJourney: null,
    }
    const model = {
      componentsInOrder: [
        {
          componentId: 'known',
          attrs: {},
          effectiveEngine: ['bg2'],
        },
      ],
    } as unknown as import('../xml/schema').InstallSequenceModel
    const out = sanitizeComponentsSession(model, 'bg2', session)
    expect(out.selectedIds).toEqual(['known'])
    expect(out.activePresetId).toBeNull()
    expect(out.presetBaseline).toBeNull()
  })

  it('round-trips plannedSnapshots on the install run', () => {
    const install = buildPersistedInstallSession({
      game: 'bg2',
      selectedIds: new Set(['a', 'b']),
      run: makeRun('bg2'),
      paused: true,
      selectedStepId: 'single:0001',
      selectedComponentId: 'comp-b',
      hideInstalled: false,
      runElapsedMs: 0,
    })
    expect(install.run.plannedSnapshots).toEqual([
      { stepId: 'single:0001', name: 'before-tweaks' },
    ])
    const store = mergeAppSession(
      emptyAppSession(),
      'bg2',
      {
        ...buildGameSessionSnapshot({
          selectedIds: new Set(['a', 'b']),
          finishedStations: new Set(),
          routeUnlocked: true,
          selectionPresets: [],
          activePresetId: null,
          presetBaseline: null,
          activeStation: 'base',
          contentMainKey: null,
          contentSubKey: null,
          contentSubTag: null,
          recommendedChecked: new Set(),
          packagesChecked: new Set(),
          modsJourney: null,
        }),
        install,
      },
      'install',
    )
    writeAppSession(store)
    const read = readAppSession()
    expect(read.byGame.bg2?.install?.run.plannedSnapshots).toEqual([
      { stepId: 'single:0001', name: 'before-tweaks' },
    ])
    window.localStorage.removeItem(APP_SESSION_STORAGE_KEY)
  })
})
