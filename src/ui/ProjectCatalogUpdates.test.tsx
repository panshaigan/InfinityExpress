import { webcrypto } from 'node:crypto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { mountReact } from '../test/react'
import { prepareCatalogSnapshot, contentRevision } from '../lib/persistence/catalogSnapshots'
import { createProjectFromWizard } from './projects/createProject'
import { getProject, saveProjectSession } from '../lib/projects/projectStore'
import { emptyWorkspaceSession } from '../lib/projects/bootstrap'

const canonical = vi.hoisted(() => ({
  xml: '<installSequence><base><component id="new:0" label="New catalog choice"/><component id="required:0" label="New catalog requirement" required="1"/></base></installSequence>',
}))

vi.mock('../lib/runtime', () => ({
  isBrowserDemo: true,
  DESKTOP_ONLY_TIP: 'Available in the desktop app',
  DESKTOP_DOWNLOAD_URL: 'https://github.com/panshaigan/InfinityExpress/releases/latest',
}))
vi.mock('../data/InstallSequence.xml?raw', () => ({
  get default() { return canonical.xml },
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

it('renders canonical XML for old and new projects and persists reconciled selections across project switches', async () => {
  const destinations = { bg1: '', bg2: '', iwd: '', pst: '' }
  const oldXml = '<installSequence><base><component id="old:0" label="Original catalog choice"/></base></installSequence>'
  const newXml = '<installSequence><base><component id="new:0" label="New catalog choice"/><component id="required:0" label="New catalog requirement" required="1"/></base></installSequence>'
  await prepareCatalogSnapshot(oldXml)
  const oldId = createProjectFromWizard({ name: 'Original project', engine: 'bg2', destinations })
  saveProjectSession(oldId, { ...emptyWorkspaceSession(), selectedIds: ['old:0'], activeStation: 'base' })
  await prepareCatalogSnapshot(newXml)
  const newId = createProjectFromWizard({ name: 'Latest project', engine: 'bg2', destinations })
  saveProjectSession(newId, { ...emptyWorkspaceSession(), selectedIds: ['new:0', 'required:0'], activeStation: 'base' })
  const { default: App } = await import('../App')
  ui.render(<App />)
  for (const [name, expected, absent] of [
    ['Original project', 'New catalog choice', 'Original catalog choice'],
    ['Latest project', 'New catalog choice', 'Original catalog choice'],
    ['Original project', 'New catalog choice', 'Original catalog choice'],
  ]) {
    const card = [...ui.container.querySelectorAll('.project-hub-card-name')].find(node => node.textContent === name)!
    await ui.click(card.closest('button')!)
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
      expect(ui.container.textContent).toContain(expected)
    })
    expect(ui.container.textContent).not.toContain(absent)
    await ui.click(ui.container.querySelector<HTMLButtonElement>('[aria-label="Projects"]')!)
  }
  expect(getProject(oldId)!.session!.selectedIds).toEqual(['required:0'])
  expect(getProject(oldId)!.catalogRevision).toBe(await contentRevision(newXml))
  expect(getProject(newId)!.session!.selectedIds).toEqual(['new:0', 'required:0'])

  const card = [...ui.container.querySelectorAll('.project-hub-card-name')].find(node => node.textContent === 'Latest project')!
  await ui.click(card.closest('button')!)
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(ui.container.textContent).toContain('New catalog choice')
  })
  // Simulate a raw-data hot update while React preserves the open project's state.
  canonical.xml = '<installSequence><base><component id="hot:0" label="Hot updated choice"/><component id="required:0" required="1"/></base></installSequence>'
  ui.render(<App />)
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(ui.container.textContent).toContain('Hot updated choice')
  })
  expect(ui.container.textContent).not.toContain('New catalog choice')
  expect(getProject(newId)!.session!.selectedIds).toEqual(['required:0'])
}, 30_000)
