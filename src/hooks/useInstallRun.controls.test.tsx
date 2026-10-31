import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred, mountReact } from '../test/react'
import { useInstallRun } from './useInstallRun'
import { parseInstallSequence } from '../lib/xml/parseInstallSequence'
import {
  cancelWeiduStep, checkInstallCompatibility, listWeiduComponents, listWeiduLanguages,
  listenWeiduInstallEvents, readGameWeiduLog, runWeiduForceUninstall, runWeiduStep,
  sendWeiduStdin, stageModIntoGameDir, type StepResult,
} from '../lib/desktop/weiduInstall'
import type { WeiduInstallEvent } from '../lib/install/types'

vi.mock('../lib/desktop/weiduInstall', async (original) => ({
  ...await original<typeof import('../lib/desktop/weiduInstall')>(),
  checkInstallCompatibility: vi.fn(), stageModIntoGameDir: vi.fn(),
  listWeiduComponents: vi.fn(), listWeiduLanguages: vi.fn(), readGameWeiduLog: vi.fn(),
  runWeiduStep: vi.fn(), runWeiduForceUninstall: vi.fn(), cancelWeiduStep: vi.fn(),
  sendWeiduStdin: vi.fn(), listenWeiduInstallEvents: vi.fn(),
  listenStageProgress: async () => () => {},
}))
vi.mock('../ui/toasts/toastContext', () => ({ useToast: () => ({ pushToast: vi.fn() }) }))

const { model } = parseInstallSequence(`<installSequence><base><mod id="Download">
  <component id="fixture:0" label="First" /><component id="fixture:1" label="Second" />
</mod></base></installSequence>`)
const selection = new Set(['fixture:0', 'fixture:1'])
const folders = { bg1: '', bg2: '/game', iwd: '', pst: '' }
const success: StepResult = {
  exitCode: 0, stdoutPath: '', stderrPath: '', debugPath: null,
  logVerified: true, timedOut: false, cancelled: false, durationMs: 10,
}

describe('install controller lifecycle', () => {
  let ui: ReturnType<typeof mountReact>
  let current: ReturnType<typeof useInstallRun>
  let emit: (event: WeiduInstallEvent) => void
  let pending: ReturnType<typeof deferred<StepResult>>[]
  let tasks: Promise<void>[]

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    localStorage.clear()
    vi.resetAllMocks()
    pending = []
    tasks = []
    vi.mocked(checkInstallCompatibility).mockResolvedValue([])
    vi.mocked(stageModIntoGameDir).mockResolvedValue('/game/fixture/setup-fixture.tp2')
    vi.mocked(listWeiduLanguages).mockResolvedValue([{ index: 0, name: 'English' }])
    vi.mocked(listWeiduComponents).mockResolvedValue([0, 1].map((number) => ({
      index: number, number, name: `Component ${number}`, label: [],
    })))
    vi.mocked(readGameWeiduLog).mockResolvedValue('')
    vi.mocked(runWeiduStep).mockResolvedValue(success)
    vi.mocked(runWeiduForceUninstall).mockResolvedValue(undefined)
    vi.mocked(cancelWeiduStep).mockResolvedValue(undefined)
    vi.mocked(sendWeiduStdin).mockResolvedValue(undefined)
    vi.mocked(listenWeiduInstallEvents).mockImplementation(async (listener) => {
      emit = listener
      return () => {}
    })
    ui = mountReact()
  })

  afterEach(async () => {
    await act(async () => {
      if (current?.run && ['running', 'paused', 'waitingForInput'].includes(current.run.runState)) {
        await current.stop()
      }
      for (const step of pending) step.resolve({ ...success, cancelled: true })
      await Promise.allSettled(tasks)
    })
    ui.unmount()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  function mount(options: { autoSkipOnErrors?: boolean; pauseOnWarnings?: boolean } = {}) {
    function Harness() {
      current = useInstallRun({ model, selectedIds: selection, game: 'bg2', gameFolders: folders, ...options })
      return null
    }
    ui.render(<Harness />)
  }
  function holdNextStep() {
    const step = deferred<StepResult>()
    pending.push(step)
    vi.mocked(runWeiduStep).mockReturnValueOnce(step.promise)
    return step
  }
  async function launch(action: () => Promise<void>) {
    await act(async () => { tasks.push(action()) })
  }
  async function waitFor(check: () => void) {
    await act(async () => { await vi.waitFor(check, { interval: 10 }) })
  }

  it('finishes the current component before pausing, then resumes without repeating it', async () => {
    mount()
    const first = holdNextStep()
    await launch(() => current.start())
    await waitFor(() => expect(runWeiduStep).toHaveBeenCalledTimes(1))
    act(() => current.pause())
    expect(current.pausePending).toBe(true)
    expect(current.run?.runState).toBe('running')
    expect(cancelWeiduStep).not.toHaveBeenCalled()
    await act(async () => first.resolve(success))
    expect(current.run).toMatchObject({ runState: 'paused', cursor: 1 })
    expect(current.run?.steps.map((s) => s.status)).toEqual(['succeeded', 'queued'])
    expect(runWeiduStep).toHaveBeenCalledTimes(1)
    await launch(() => current.continueRun())
    await act(async () => { await tasks[0] })
    expect(current.run?.runState).toBe('completed')
    expect(vi.mocked(runWeiduStep).mock.calls.map(([step]) => step.componentNumber)).toEqual([0, 1])
  })

  it('can cancel a pending pause and complete the remaining plan', async () => {
    mount()
    const first = holdNextStep()
    await launch(() => current.start())
    await waitFor(() => expect(runWeiduStep).toHaveBeenCalledTimes(1))
    act(() => current.pause())
    act(() => current.pause())
    expect(current.pausePending).toBe(false)
    await act(async () => { first.resolve(success); await tasks[0] })
    expect(current.run?.runState).toBe('completed')
    expect(runWeiduStep).toHaveBeenCalledTimes(2)
  })

  it('waits for cancellation and rollback before marking Stop complete, then retries that component', async () => {
    mount()
    const first = holdNextStep()
    const rollback = deferred<Awaited<ReturnType<typeof runWeiduForceUninstall>>>()
    vi.mocked(runWeiduForceUninstall).mockReturnValueOnce(rollback.promise)
    await launch(() => current.start())
    await waitFor(() => expect(runWeiduStep).toHaveBeenCalledTimes(1))
    await act(async () => current.stop())
    expect(cancelWeiduStep).toHaveBeenCalledTimes(1)
    expect(current.stopping).toBe(true)
    await act(async () => first.resolve({ ...success, cancelled: true }))
    try {
      expect(runWeiduForceUninstall).toHaveBeenCalledWith(expect.objectContaining({ componentNumber: 0 }))
      expect(current.stopping).toBe(true)
      expect(runWeiduStep).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => {
        rollback.resolve(undefined)
        await tasks[0]
      })
    }
    expect(current.run).toMatchObject({ runState: 'stopped', cursor: 0 })
    expect(current.run?.steps.map((s) => s.status)).toEqual(['queued', 'queued'])
    expect(current.stopping).toBe(false)
    await act(async () => current.continueRun())
    expect(current.run?.runState).toBe('completed')
    expect(vi.mocked(runWeiduStep).mock.calls.map(([step]) => step.componentNumber)).toEqual([0, 0, 1])
  })

  it('keeps the cursor on a failed component so Play retries it before the next one', async () => {
    mount()
    vi.mocked(runWeiduStep).mockResolvedValueOnce({ ...success, exitCode: 1, logVerified: false })
    await act(async () => current.start())
    expect(current.run).toMatchObject({ runState: 'failed', cursor: 0 })
    expect(current.run?.steps[0]?.status).toBe('failed')
    await act(async () => current.continueRun())
    expect(current.run?.runState).toBe('completed')
    expect(vi.mocked(runWeiduStep).mock.calls.map(([step]) => step.componentNumber)).toEqual([0, 0, 1])
  })

  it('continues after an error only when auto-skip is enabled, retaining the failed outcome', async () => {
    mount({ autoSkipOnErrors: true })
    vi.mocked(runWeiduStep).mockResolvedValueOnce({ ...success, exitCode: 1, logVerified: false })
    await act(async () => current.start())
    expect(current.run?.runState).toBe('completed')
    expect(current.run?.steps.map((s) => s.status)).toEqual(['failed', 'succeeded'])
  })

  it('does not start overlapping WeiDU processes when Play is clicked twice', async () => {
    mount()
    const first = holdNextStep()
    await launch(() => current.start())
    await waitFor(() => expect(runWeiduStep).toHaveBeenCalledTimes(1))
    await act(async () => current.continueRun())
    expect(runWeiduStep).toHaveBeenCalledTimes(1)
    await act(async () => { first.resolve(success); await tasks[0] })
    expect(current.run?.runState).toBe('completed')
    expect(runWeiduStep).toHaveBeenCalledTimes(2)
  })

  it('pauses after a warning when requested and resumes at the next component', async () => {
    mount({ pauseOnWarnings: true })
    vi.mocked(runWeiduStep).mockResolvedValueOnce({ ...success, exitCode: 3 })
    await launch(() => current.start())
    expect(current.run).toMatchObject({ runState: 'paused', cursor: 1 })
    expect(current.run?.steps[0]?.status).toBe('succeededWithWarnings')
    expect(runWeiduStep).toHaveBeenCalledTimes(1)
    await launch(() => current.continueRun())
    await act(async () => { await tasks[0] })
    expect(current.run?.steps.map((s) => s.status)).toEqual(['succeededWithWarnings', 'succeeded'])
  })

  it('blocks incompatible plans before staging even when auto-skip is enabled', async () => {
    mount({ autoSkipOnErrors: true })
    vi.mocked(checkInstallCompatibility).mockResolvedValueOnce([{
      stepId: current.planSteps[0]!.stepId,
      action: 'block', reason: 'Unsupported game executable',
    }])
    await act(async () => current.start())
    expect(current.run?.runState).toBe('failed')
    expect(stageModIntoGameDir).not.toHaveBeenCalled()
    expect(runWeiduStep).not.toHaveBeenCalled()
  })

  it('handles an input prompt and resumes the same native process after sending input', async () => {
    mount()
    const first = holdNextStep()
    await launch(() => current.start())
    await waitFor(() => expect(runWeiduStep).toHaveBeenCalledTimes(1))
    act(() => emit({ kind: 'inputRequired', prompt: 'Choose an option' }))
    expect(current.run?.runState).toBe('waitingForInput')
    expect(current.inputPrompt).toBe('Choose an option')
    await act(async () => current.sendInput('1'))
    expect(sendWeiduStdin).toHaveBeenCalledWith('1')
    expect(runWeiduStep).toHaveBeenCalledTimes(1)
    await act(async () => { first.resolve(success); await tasks[0] })
    expect(current.run?.runState).toBe('completed')
    expect(current.inputPrompt).toBeNull()
  })
})
