import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke }))
import { appendTextFileAt, readTextFileTail } from './fsDialogs'

describe('background text appends', () => {
  beforeEach(() => invoke.mockReset())

  it('serializes equivalent Windows paths and waits before reading the log tail', async () => {
    let finishFirst!: () => void
    invoke.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve }))
    invoke.mockResolvedValueOnce(undefined)
    invoke.mockResolvedValueOnce('first\nsecond\n')
    const first = appendTextFileAt('D:\\Logs\\Run.log', 'first\n')
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    const second = appendTextFileAt('d:/logs/run.log', 'second\n')
    const tail = readTextFileTail('D:/Logs/Run.log', 100)
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(1)
    finishFirst()
    await Promise.all([first, second])
    expect(await tail).toBe('first\nsecond\n')
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'append_text_file', 'append_text_file', 'read_text_file_tail',
    ])
  })

  it('allows the next append after a disk error', async () => {
    invoke.mockRejectedValueOnce('disk error')
    invoke.mockResolvedValueOnce(undefined)
    const first = appendTextFileAt('/logs/run.log', 'first')
    const rejected = expect(first).rejects.toBe('disk error')
    const second = appendTextFileAt('/logs/run.log', 'second')
    await rejected
    await expect(second).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
