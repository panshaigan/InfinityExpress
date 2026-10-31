// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstallRun } from './useInstallRun'
import { readGameWeiduLog } from '../lib/desktop/weiduInstall'
import {
  persistedWeiduLogToImport,
  weiduLogImportToPersisted,
  type WeiduLogImportResult,
} from '../lib/install/weiduLogMap'
import type { ComponentNode, InstallSequenceModel } from '../lib/xml/schema'
import type { ComponentRunStatus, InstallRun } from '../lib/install/types'
import {
  buildPersistedInstallSession,
  parsePersistedInstallSession,
  type PersistedInstallSession,
} from '../lib/ui/appSessionPrefs'

vi.mock('../lib/desktop/weiduInstall', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/desktop/weiduInstall')>(),
  readGameWeiduLog: vi.fn(),
  listenWeiduInstallEvents: async () => () => {},
  listenStageProgress: async () => () => {},
}))
vi.mock('../lib/install/stepLogs', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/install/stepLogs')>(),
  appendRunLogLine: vi.fn(),
}))
vi.mock('../ui/toasts/toastContext', () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}))

const folders = { bg1: 'D:/game/bg1', bg2: 'D:/game/bg2', iwd: '', pst: '' }
const components: ComponentNode[] = Array.from({ length: 5 }, (_, n) => ({
  key: `mod:${n}`,
  tag: 'component',
  kind: 'component',
  componentId: `mod:${n}`,
  orderIndex: n,
  attrs: { id: `mod:${n}`, modId: 'Download', label: `Component ${n}` },
  effectiveEngine: 'bg2,eet1,eet',
  children: [],
}))
const model: InstallSequenceModel = {
  stations: [],
  componentsInOrder: components,
  componentsById: new Map(components.map((c) => [c.componentId, c])),
  nodesByKey: new Map(components.map((c) => [c.key, c])),
}
const selection = new Set(components.map((c) => c.componentId))

function imported(componentId: string): WeiduLogImportResult {
  return {
    hasLog: true,
    hits: [{
      componentId,
      phase: 'single',
      tp2Path: 'mod/mod.tp2',
      absoluteTp2Path: `${folders.bg2}/mod/mod.tp2`,
      stagedFolderName: 'mod',
      weiduNumber: Number(componentId.split(':')[1]),
      languageIndex: 0,
    }],
    componentIds: new Set([componentId]),
    unmatched: [],
    listingErrors: [],
  }
}

describe('backup restore installation state', () => {
  let root: Root
  let current: ReturnType<typeof useInstallRun>
  let identified: WeiduLogImportResult | null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(readGameWeiduLog).mockReset().mockResolvedValue('')
    root = createRoot(document.createElement('div'))
  })

  afterEach(() => act(() => root.unmount()))

  function mount(game: 'bg2' | 'eet' = 'bg2', session?: PersistedInstallSession) {
    function Harness() {
      const [logImport, setLogImport] = useState<WeiduLogImportResult | null>(imported('mod:4'))
      identified = logImport
      current = useInstallRun({
        model,
        game,
        gameFolders: folders,
        selectedIds: selection,
        weiduLogImport: logImport,
        onWeiduLogImportChange: setLogImport,
        initialInstallState: session ? { installSession: session } : undefined,
      })
      return null
    }
    act(() => root.render(createElement(Harness)))
  }

  function setOldRun() {
    const statuses: ComponentRunStatus[] = [
      'succeeded', 'failed', 'skipped', 'succeededWithWarnings', 'alreadyInstalled',
    ]
    const old: InstallRun = {
      runId: 'old-run', game: 'bg2', logDir: '', runState: 'completed', cursor: 5,
      breakpointStepIds: [], plannedSnapshots: [], artifactsCleaned: true,
      steps: current.planSteps.map((step, n) => ({
        ...step,
        status: statuses[n % statuses.length]!,
        tp2Path: 'D:/old/mod/setup-mod.tp2', stagedFolderName: 'old-mod',
        weiduNumber: 100 + n, languageIndex: 9,
        warnings: ['old warning'], errors: ['old error'], resultLines: ['old result'],
        startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:01:00Z',
      })),
    }
    act(() => current.setRun(old))
  }

  it('replaces old outcomes and cursor with the restored log, keeping the selected list', async () => {
    mount()
    setOldRun()
    vi.mocked(readGameWeiduLog).mockResolvedValue(
      '~MOD/MOD.TP2~ #2 #0\n~MOD/MOD.TP2~ #2 #2\n',
    )
    await act(async () => { await current.restartFromBackup() })
    expect(current.run?.steps.map((s) => s.status)).toEqual([
      'alreadyInstalled', 'queued', 'alreadyInstalled', 'queued', 'queued',
    ])
    expect(current.run).toMatchObject({ cursor: 1, runState: 'idle', artifactsCleaned: false })
    expect(current.run?.steps[0]).toMatchObject({ weiduNumber: 0, languageIndex: 2, stagedFolderName: 'MOD' })
    expect(current.run?.steps[1]).toMatchObject({ tp2Path: '', weiduNumber: null, languageIndex: null })
    for (const step of current.run!.steps) {
      expect(step.warnings).toEqual([])
      expect(step.errors).toEqual([])
      expect(step.resultLines).toEqual([])
      expect(step.startedAt).toBeUndefined()
      expect(step.finishedAt).toBeUndefined()
    }
    expect(current.run?.steps.map((s) => s.componentId)).toEqual([...selection])
    expect(identified?.componentIds).toEqual(new Set(['mod:0', 'mod:2']))
    const reopened = persistedWeiduLogToImport(weiduLogImportToPersisted(identified!))
    expect(reopened?.componentIds).toEqual(new Set(['mod:0', 'mod:2']))
  })

  it('refreshes the plan before first Play and clears installed marks on vanilla restore', async () => {
    mount()
    vi.mocked(readGameWeiduLog).mockResolvedValue('~MOD/MOD.TP2~ #0 #0\n')
    await act(async () => { await current.restartFromBackup() })
    expect(current.run).toBeNull()
    expect(current.planSteps.map((s) => s.status)).toEqual([
      'alreadyInstalled', 'queued', 'queued', 'queued', 'queued',
    ])
    expect(current.cursorStepId).toBe(current.planSteps[1]?.stepId)
    vi.mocked(readGameWeiduLog).mockResolvedValue('')
    await act(async () => { await current.restartFromBackup() })
    expect(current.planSteps.every((s) => s.status === 'queued')).toBe(true)
    expect(current.cursorStepId).toBe(current.planSteps[0]?.stepId)
    expect(identified?.hasLog).toBe(false)
    expect(identified?.componentIds.size).toBe(0)
  })

  it('preserves pre-snapshot history and can reopen the reconciled idle run', async () => {
    mount()
    setOldRun()
    const old = current.run!
    act(() => current.setRun({
      ...old,
      steps: old.steps.map((s, n) => ({
        ...s,
        tp2Path: `${folders.bg2}/MOD/MOD.TP2`, weiduNumber: n, languageIndex: 0,
        stdoutLogPath: `D:/logs/${n}-mod.log`, stderrLogPath: `D:/logs/${n}-component.log`,
        ...(n === 3 ? { finishedAt: '2026-11-01T00:00:00Z' } : {}),
      })),
    }))
    vi.mocked(readGameWeiduLog).mockResolvedValue('~MOD/MOD.TP2~ #0 #0\n~MOD/MOD.TP2~ #0 #3\n')
    await act(async () => {
      await current.restartFromBackup({ createdAt: '2026-10-31T12:00:00Z', phases: ['single'] })
    })
    expect(current.run?.steps.map((s) => s.status)).toEqual([
      'succeeded', 'failed', 'skipped', 'alreadyInstalled', 'queued',
    ])
    expect(current.run?.steps[0]).toMatchObject({ warnings: ['old warning'], stdoutLogPath: 'D:/logs/0-mod.log' })
    expect(current.run?.steps[1]).toMatchObject({ errors: ['old error'], stderrLogPath: 'D:/logs/1-component.log' })
    expect(current.run?.steps[3]?.stdoutLogPath).toBeUndefined()

    const persisted = buildPersistedInstallSession({
      game: 'bg2', selectedIds: selection, run: current.run!, paused: false,
      selectedStepId: null, selectedComponentId: null, hideInstalled: false,
      pauseOnWarnings: false, autoSkipOnErrors: false, followCursor: false, runElapsedMs: 0,
    })
    const reopened = parsePersistedInstallSession(JSON.parse(JSON.stringify(persisted)))!
    act(() => root.render(null))
    mount('bg2', reopened)
    expect(current.run?.runState).toBe('idle')
    expect(current.run?.steps[0]).toMatchObject({ status: 'succeeded', stdoutLogPath: 'D:/logs/0-mod.log' })
    expect(current.run?.steps[1]).toMatchObject({ status: 'failed', errors: ['old error'] })
  })

  it('clears all previous run outcomes when the restored backup has no log', async () => {
    mount()
    setOldRun()
    await act(async () => { await current.restartFromBackup() })
    expect(current.run?.steps.every((s) => s.status === 'queued')).toBe(true)
    expect(current.run?.cursor).toBe(0)
    expect(current.run?.runState).toBe('idle')
    expect(identified?.componentIds.size).toBe(0)
  })

  it('reads both EET destinations and marks each phase from its own log', async () => {
    mount('eet')
    vi.mocked(readGameWeiduLog).mockImplementation(async (dir) =>
      dir === folders.bg1 ? '~MOD/MOD.TP2~ #0 #0\n' : '~MOD/MOD.TP2~ #1 #1\n',
    )
    await act(async () => { await current.restartFromBackup() })
    const installed = current.planSteps.filter((s) => s.status === 'alreadyInstalled')
    expect(installed.map((s) => [s.componentId, s.phase, s.languageIndex])).toEqual([
      ['mod:0', 'eet1', 0], ['mod:1', 'eet', 1],
    ])
    expect(readGameWeiduLog).toHaveBeenCalledWith(folders.bg1)
    expect(readGameWeiduLog).toHaveBeenCalledWith(folders.bg2)
  })
})
