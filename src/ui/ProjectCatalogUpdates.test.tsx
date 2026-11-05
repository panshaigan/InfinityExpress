import { webcrypto } from 'node:crypto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountReact } from '../test/react'
import { prepareCatalogSnapshot, readCatalogSnapshot } from '../lib/persistence/catalogSnapshots'
import { createProjectFromWizard } from './projects/createProject'
import { getProject, saveProjectSession } from '../lib/projects/projectStore'
import { emptyWorkspaceSession } from '../lib/projects/bootstrap'

vi.mock('../lib/runtime', () => ({
  isBrowserDemo: true,
  DESKTOP_ONLY_TIP: 'Available in the desktop app',
  DESKTOP_DOWNLOAD_URL: 'https://github.com/panshaigan/InfinityExpress/releases/latest',
}))
vi.mock('../lib/persistence/catalogSnapshots', async (original) => ({
  ...await original<typeof import('../lib/persistence/catalogSnapshots')>(),
  readCatalogSnapshot: vi.fn(),
}))

let ui: ReturnType<typeof mountReact>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  ui = mountReact()
})
afterEach(() => { ui.unmount(); localStorage.clear(); vi.unstubAllGlobals() })

it('switches the rendered component model with each project without importing newer required components into old projects', async () => {
  const destinations = { bg1: '', bg2: '', iwd: '', pst: '' }
  const oldXml = '<installSequence><base><component id="old:0" label="Original catalog choice"/></base></installSequence>'
  const newXml = '<installSequence><base><component id="new:0" label="New catalog choice"/><component id="required:0" label="New catalog requirement" required="1"/></base></installSequence>'
  const oldRevision = await prepareCatalogSnapshot(oldXml)
  const oldId = createProjectFromWizard({ name: 'Original project', engine: 'bg2', destinations })
  saveProjectSession(oldId, { ...emptyWorkspaceSession(), selectedIds: ['old:0'], activeStation: 'base' })
  await prepareCatalogSnapshot(newXml)
  vi.mocked(readCatalogSnapshot).mockImplementation(async revision => revision === oldRevision ? oldXml : newXml)
  const newId = createProjectFromWizard({ name: 'Latest project', engine: 'bg2', destinations })
  saveProjectSession(newId, { ...emptyWorkspaceSession(), selectedIds: ['new:0', 'required:0'], activeStation: 'base' })
  const { default: App } = await import('../App')
  ui.render(<App />)
  for (const [name, expected, absent] of [
    ['Original project', 'Original catalog choice', 'New catalog choice'],
    ['Latest project', 'New catalog choice', 'Original catalog choice'],
    ['Original project', 'Original catalog choice', 'New catalog choice'],
  ]) {
    const card = [...ui.container.querySelectorAll('.project-hub-card-name')].find(node => node.textContent === name)!
    await ui.click(card.closest('button')!)
    expect(ui.container.textContent).toContain(expected)
    expect(ui.container.textContent).not.toContain(absent)
    await ui.click(ui.container.querySelector<HTMLButtonElement>('[aria-label="Projects"]')!)
  }
  expect(getProject(oldId)!.session!.selectedIds).toEqual(['old:0'])
  expect(getProject(newId)!.session!.selectedIds).toEqual(['new:0', 'required:0'])
}, 30_000)
