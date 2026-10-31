import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred, mountReact } from '../../test/react'
import { ProjectWizard } from './ProjectWizard'
import {
  ensureProjectDir, getProject, listProjects, prepareDestinationForKey,
  setVanillaBinding, validateDestinationFolder,
} from '../../lib/projects'
import { writeAppDirPaths } from '../../lib/ui/appDirPrefs'

vi.mock('../../lib/projects', async (original) => ({
  ...await original<typeof import('../../lib/projects')>(),
  validateDestinationFolder: vi.fn(),
  prepareDestinationForKey: vi.fn(),
  ensureProjectDir: vi.fn(),
}))
vi.mock('../toasts/toastContext', () => ({ useToast: () => ({ pushToast: vi.fn() }) }))

describe('project creation through the wizard', () => {
  let ui: ReturnType<typeof mountReact>
  const onCreated = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    localStorage.clear()
    vi.resetAllMocks()
    vi.mocked(validateDestinationFolder).mockResolvedValue('/games/bg2')
    vi.mocked(prepareDestinationForKey).mockResolvedValue({ action: 'accepted_existing', path: '/games/bg2' })
    vi.mocked(ensureProjectDir).mockResolvedValue(undefined)
    writeAppDirPaths({ backupDir: '/data' })
    for (const key of ['bg1', 'bg2'] as const) {
      setVanillaBinding(key, { mode: 'external', path: `/clean/${key}` })
    }
    ui = mountReact()
    ui.render(<ProjectWizard onCancel={vi.fn()} onCreated={onCreated}
      settingsOpen={false} onOpenSettings={vi.fn()} />)
  })

  afterEach(() => { ui.unmount(); vi.unstubAllGlobals(); localStorage.clear() })

  async function selectEngine(label = 'BG2:EE') {
    const card = [...ui.container.querySelectorAll<HTMLButtonElement>('.engine-card')]
      .find((b) => b.querySelector('.engine-card-title')?.textContent === label)!
    expect(card).toBeDefined()
    await ui.click(card)
    await ui.input('project-wizard-name', ' My project ')
    await ui.click(ui.button('Continue'))
  }

  it('requires an engine and name, then skips vanilla setup when already bound', async () => {
    expect(ui.button('Continue').disabled).toBe(true)
    await selectEngine()
    expect(ui.container.querySelector('#project-wizard-data-root')).toBeNull()
    expect(ui.button('Create project').disabled).toBe(true)
    await ui.click(ui.button('Back'))
    expect(ui.container.querySelector<HTMLInputElement>('#project-wizard-name')?.value).toBe(' My project ')
    expect(listProjects()).toHaveLength(0)
  })

  it('creates and stores a project only after destination preparation finishes', async () => {
    const preparation = deferred<Awaited<ReturnType<typeof prepareDestinationForKey>>>()
    vi.mocked(prepareDestinationForKey).mockReturnValueOnce(preparation.promise)
    await selectEngine()
    await ui.input('project-wizard-dest-bg2', '/games/bg2')
    await ui.click(ui.button('Create project'))
    try {
      expect(ui.button('Preparing…').disabled).toBe(true)
      expect(ui.button('Cancel').disabled).toBe(true)
      expect(listProjects()).toHaveLength(0)
      expect(onCreated).not.toHaveBeenCalled()
    } finally {
      await act(async () => preparation.resolve({ action: 'copied_vanilla', path: '/games/bg2' }))
    }
    await act(async () => { await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1)) })
    expect(getProject(onCreated.mock.calls[0]![0])?.meta).toMatchObject({
      name: 'My project', engine: 'bg2', destinations: { bg2: '/games/bg2', bg1: '' },
    })
    expect(ensureProjectDir).toHaveBeenCalledWith('My project')
  })

  it('shows preparation errors and allows retry without creating a partial project', async () => {
    vi.mocked(prepareDestinationForKey).mockRejectedValueOnce('Permission denied')
    await selectEngine()
    await ui.input('project-wizard-dest-bg2', '/games/bg2')
    await ui.click(ui.button('Create project'))
    expect(ui.container.textContent).toContain('Permission denied')
    expect(onCreated).not.toHaveBeenCalled()
    expect(listProjects()).toHaveLength(0)
    await ui.input('project-wizard-dest-bg2', '/games/writable')
    await ui.click(ui.button('Create project'))
    await act(async () => { await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1)) })
    expect(listProjects()).toHaveLength(1)
  })

  it('requires two distinct EET destinations and prepares them in phase order', async () => {
    await selectEngine('EET')
    await ui.input('project-wizard-dest-bg1', '/games/saga')
    expect(ui.button('Create project').disabled).toBe(true)
    await ui.input('project-wizard-dest-bg2', '/games/saga')
    await ui.click(ui.button('Create project'))
    expect(ui.container.textContent).toContain('Must be a different folder')
    expect(prepareDestinationForKey).not.toHaveBeenCalled()
    await ui.input('project-wizard-dest-bg1', '/games/pre-eet')
    await ui.input('project-wizard-dest-bg2', '/games/eet')
    await ui.click(ui.button('Create project'))
    await act(async () => { await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1)) })
    expect(prepareDestinationForKey).toHaveBeenNthCalledWith(1, 'bg1', '/games/pre-eet')
    expect(prepareDestinationForKey).toHaveBeenNthCalledWith(2, 'bg2', '/games/eet')
    expect(listProjects()[0]?.engine).toBe('eet')
  })

  it('requires missing vanilla setup before showing destinations', async () => {
    setVanillaBinding('bg2', null)
    await selectEngine()
    expect(ui.container.querySelector('#project-wizard-data-root')).not.toBeNull()
    expect(ui.button('Continue').disabled).toBe(true)
    expect(ui.container.querySelector('#project-wizard-dest-bg2')).toBeNull()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
