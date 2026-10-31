import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountReact } from '../test/react'
import { useProjectSessionPersistence } from './useProjectSessionPersistence'
import { createProjectFromWizard } from '../ui/projects/createProject'
import { emptyWorkspaceSession, loadProjectRecord } from '../lib/projects/bootstrap'
import { getProject } from '../lib/projects'
import { parseInstallSequence } from '../lib/xml/parseInstallSequence'
import type { GameSession } from '../lib/ui/appSessionPrefs'

const { model } = parseInstallSequence(`<installSequence><base>
  <component id="first:0" label="First" /><component id="second:0" label="Second" />
</base></installSequence>`)

describe('project session switching', () => {
  let ui: ReturnType<typeof mountReact>
  let first: string
  let second: string
  let current: ReturnType<typeof useProjectSessionPersistence>

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.useFakeTimers()
    localStorage.clear()
    const destinations = { bg1: '', bg2: '/games/bg2', iwd: '', pst: '' }
    first = createProjectFromWizard({ name: 'First', engine: 'bg2', destinations })
    second = createProjectFromWizard({ name: 'Second', engine: 'bg2', destinations })
    ui = mountReact()
  })
  afterEach(() => { ui.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear() })

  function render(id: string | null, session: GameSession) {
    ui.render(<Harness id={id} build={() => session} />)
  }
  function Harness({ id, build }: { id: string | null; build: () => GameSession }) {
    current = useProjectSessionPersistence({ projectId: id, appPhase: 'components', buildGameSession: build })
    return null
  }

  it('flushes the outgoing project and restores each selection independently', async () => {
    const firstSession = { ...emptyWorkspaceSession(), selectedIds: ['first:0'], activeStation: 'base' as const }
    render(first, firstSession)
    act(() => current.flushSession())
    render(second, { ...emptyWorkspaceSession(), selectedIds: ['second:0'] })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(loadProjectRecord(model, first)?.session?.selectedIds).toEqual(['first:0'])
    expect(loadProjectRecord(model, first)?.session?.activeStation).toBe('base')
    expect(loadProjectRecord(model, second)?.session?.selectedIds).toEqual(['second:0'])
    render(first, { ...firstSession, selectedIds: ['first:0', 'second:0'] })
    act(() => window.dispatchEvent(new Event('beforeunload')))
    expect(getProject(first)?.session?.selectedIds).toEqual(['first:0', 'second:0'])
    expect(getProject(second)?.session?.selectedIds).toEqual(['second:0'])
  })

  it('cancels the previous debounce on switch and uses the latest session builder', async () => {
    render(first, { ...emptyWorkspaceSession(), selectedIds: ['first:0'] })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    render(second, { ...emptyWorkspaceSession(), selectedIds: [] })
    render(second, { ...emptyWorkspaceSession(), selectedIds: ['second:0'] })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(getProject(first)?.session).toBeNull()
    expect(getProject(second)?.session?.selectedIds).toEqual(['second:0'])
  })

  it('does not save workspace data while the project hub is open or after unmount', async () => {
    render(first, { ...emptyWorkspaceSession(), selectedIds: ['first:0'] })
    act(() => current.flushSession())
    render(null, { ...emptyWorkspaceSession(), selectedIds: ['second:0'] })
    act(() => window.dispatchEvent(new Event('beforeunload')))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(getProject(first)?.session?.selectedIds).toEqual(['first:0'])
    render(second, emptyWorkspaceSession())
    ui.render(null)
    await act(async () => { await vi.runAllTimersAsync() })
    act(() => window.dispatchEvent(new Event('beforeunload')))
    expect(getProject(second)?.session).toBeNull()
  })
})
