import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readInstallRunState, writeInstallRunState } from './runStateStore'
import { isDesktopApp, readOptionalTextFile, writeTextFileAt } from '../desktop/fsDialogs'
import { buildPersistedInstallSession } from '../ui/appSessionPrefs'

vi.mock('../desktop/fsDialogs', () => ({ isDesktopApp: vi.fn(() => true), ensureDir: vi.fn(), readOptionalTextFile: vi.fn(), writeTextFileAt: vi.fn() }))
beforeEach(() => { vi.mocked(isDesktopApp).mockReturnValue(true); vi.clearAllMocks() })

function session() {
  return buildPersistedInstallSession({ game: 'bg2', selectedIds: new Set(),
    run: { runId: 'run', game: 'bg2', logDir: '/run', cursor: 0, runState: 'paused', steps: [], breakpointStepIds: [], plannedSnapshots: [], artifactsCleaned: false },
    paused: true, selectedStepId: null, selectedComponentId: null, hideInstalled: false, pauseOnWarnings: false,
    autoSkipOnErrors: false, followCursor: false, runElapsedMs: 0 })
}

describe('saved install schema', () => {
  it('accepts legacy and v1 states and stamps newly written states', async () => {
    const value = session()
    for (const state of [value, { ...value, schemaVersion: 1 }]) {
      vi.mocked(readOptionalTextFile).mockResolvedValueOnce(JSON.stringify(state))
      expect(await readInstallRunState('/run')).toEqual(value)
    }
    await writeInstallRunState('/run', value)
    const saved = vi.mocked(writeTextFileAt).mock.calls[0][1]
    expect(JSON.parse(saved)).toMatchObject({ schemaVersion: 1, run: value.run })
  })

  it('distinguishes missing state from invalid/future state and read failures', async () => {
    vi.mocked(readOptionalTextFile).mockResolvedValueOnce(null)
    expect(await readInstallRunState('/run')).toBeNull()
    for (const text of ['', '{broken', JSON.stringify({ ...session(), schemaVersion: 2 })]) {
      vi.mocked(readOptionalTextFile).mockResolvedValueOnce(text)
      await expect(readInstallRunState('/run')).rejects.toThrow('Cannot read saved install state')
    }
    vi.mocked(readOptionalTextFile).mockRejectedValueOnce(new Error('access denied'))
    await expect(readInstallRunState('/run')).rejects.toThrow('access denied')
    expect(writeTextFileAt).not.toHaveBeenCalled()
  })
})
