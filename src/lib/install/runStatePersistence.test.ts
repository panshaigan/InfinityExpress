import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPersistedInstallSession } from '../ui/appSessionPrefs'
import { writeInstallRunState } from './runStateStore'
import { flushInstallRunStateWrite, scheduleInstallRunStateWrite } from './runStatePersistence'

vi.mock('./runStateStore', () => ({ writeInstallRunState: vi.fn() }))

function session(runId: string) {
  return buildPersistedInstallSession({
    game: 'bg2', selectedIds: new Set(),
    run: {
      runId, game: 'bg2', logDir: `/data/projects/project/${runId}`,
      runState: 'paused', cursor: 0, steps: [], breakpointStepIds: [], plannedSnapshots: [],
    },
    paused: true, selectedStepId: null, selectedComponentId: null,
    hideInstalled: false, pauseOnWarnings: false, autoSkipOnErrors: false,
    followCursor: false, runElapsedMs: 0,
  })
}

describe('install run persistence scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(writeInstallRunState).mockReset().mockResolvedValue(undefined)
  })

  afterEach(async () => {
    scheduleInstallRunStateWrite(null)
    await flushInstallRunStateWrite()
    vi.useRealTimers()
  })

  it('coalesces rapid updates and writes the latest state after inactivity', async () => {
    scheduleInstallRunStateWrite(session('old'))
    await vi.advanceTimersByTimeAsync(300)
    const latest = session('latest')
    scheduleInstallRunStateWrite(latest)
    await vi.advanceTimersByTimeAsync(399)
    expect(writeInstallRunState).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(writeInstallRunState).toHaveBeenCalledExactlyOnceWith(latest.run.logDir, latest)
  })

  it('cancels pending writes when the session is cleared', async () => {
    scheduleInstallRunStateWrite(session('closed'))
    scheduleInstallRunStateWrite(null)
    await vi.runAllTimersAsync()
    await flushInstallRunStateWrite()
    expect(writeInstallRunState).not.toHaveBeenCalled()
  })

  it('flushes immediately without leaving a duplicate timer write', async () => {
    const pending = session('closing')
    scheduleInstallRunStateWrite(pending)
    await flushInstallRunStateWrite()
    expect(writeInstallRunState).toHaveBeenCalledExactlyOnceWith(pending.run.logDir, pending)
    await vi.runAllTimersAsync()
    expect(writeInstallRunState).toHaveBeenCalledTimes(1)
  })

  it('serializes disk writes and waits for an in-flight write on flush', async () => {
    let finishWrite!: () => void
    vi.mocked(writeInstallRunState).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishWrite = resolve }),
    )
    const first = session('first')
    const second = session('second')
    scheduleInstallRunStateWrite(first)
    await vi.advanceTimersByTimeAsync(400)
    let flushed = false
    let flushing: Promise<void> | undefined
    try {
      scheduleInstallRunStateWrite(second)
      await vi.advanceTimersByTimeAsync(400)
      expect(writeInstallRunState).toHaveBeenCalledTimes(1)
      flushing = flushInstallRunStateWrite().then(() => { flushed = true })
      await Promise.resolve()
      expect(flushed).toBe(false)
    } finally {
      // Release the write even when an assertion fails so teardown cannot hang.
      finishWrite()
      await flushing
    }
    expect(writeInstallRunState).toHaveBeenNthCalledWith(2, second.run.logDir, second)
    expect(flushed).toBe(true)
  })

  it('allows subsequent saves after a disk write fails', async () => {
    vi.mocked(writeInstallRunState).mockRejectedValueOnce(new Error('disk full'))
    scheduleInstallRunStateWrite(session('failed'))
    await expect(flushInstallRunStateWrite()).resolves.toBeUndefined()
    const recovered = session('recovered')
    scheduleInstallRunStateWrite(recovered)
    await flushInstallRunStateWrite()
    expect(writeInstallRunState).toHaveBeenNthCalledWith(2, recovered.run.logDir, recovered)
  })
})
