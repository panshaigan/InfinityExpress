import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { mountReact } from '../test/react'
import App from '../App'
import * as exportOrder from '../lib/export/installOrder'
import { getProject, listProjects } from '../lib/projects'

vi.mock('../lib/runtime', () => ({
  isBrowserDemo: true,
  DESKTOP_ONLY_TIP: 'Available in the desktop app',
  DESKTOP_DOWNLOAD_URL: 'https://github.com/panshaigan/InfinityExpress/releases/latest',
}))

let ui: ReturnType<typeof mountReact>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  ui = mountReact()
})
afterEach(() => {
  ui.unmount()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// This full-app journey uses the real catalog and mounts the app twice. Allow
// coverage instrumentation and parallel CI workers more time than unit tests.
it('opens the hub, creates a folder-free project, exports, and restores the project', async () => {
  ui.render(<App />)
  expect(ui.container.querySelector('.project-hub')).not.toBeNull()
  expect(ui.container.textContent).toContain('Browser demo')
  const newProject = ui.container.querySelector<HTMLButtonElement>('.project-hub-new-btn')
    ?? [...ui.container.querySelectorAll('button')].find(b => b.textContent?.includes('Create'))!
  await ui.click(newProject)
  await ui.input('project-wizard-name', 'Demo saga')
  const engine = [...ui.container.querySelectorAll<HTMLButtonElement>('.engine-card')]
    .find(b => b.querySelector('.engine-card-title')?.textContent === 'EET')!
  await ui.click(engine)
  await ui.click(ui.button('Create project'))
  const project = listProjects()[0]
  expect(project.engine).toBe('eet')
  expect(Object.values(project.destinations).every(path => path === '')).toBe(true)
  expect(ui.container.querySelector('.presets-station')).not.toBeNull()
  expect(ui.container.querySelector('.directory-field')).toBeNull()
  for (const phase of ['Mods', 'Install']) {
    const button = [...ui.container.querySelectorAll<HTMLButtonElement>('.phase-nav-btn')]
      .find(b => b.textContent?.includes(phase))!
    expect(button.disabled).toBe(true)
    await ui.click(button)
  }
  expect(ui.container.querySelector('.phase-nav-btn.active')?.textContent).toContain('Components')
  await ui.click(ui.button('Finish route'))
  expect(document.body.textContent).toContain('Export install order')
  expect(document.body.textContent).toContain('BG1 (Pre-EET)')
  expect(document.body.textContent).toContain('BG2 (EET)')
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input')]
  expect(inputs.some(input => input.value === 'install-order-pre-eet.csv')).toBe(true)
  const download = vi.spyOn(exportOrder, 'downloadText').mockImplementation(() => {})
  await ui.click(document.querySelector<HTMLButtonElement>('[aria-label="Save install order"]')!)
  expect(download).toHaveBeenLastCalledWith(expect.stringContaining(';'), 'install-order-pre-eet.csv')
  await ui.click([...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find(button => button.textContent === 'BG2 (EET)')!)
  await ui.click(document.querySelector<HTMLButtonElement>('[aria-label="Save install order"]')!)
  expect(download).toHaveBeenLastCalledWith(expect.stringContaining(';'), 'install-order-eet.csv')
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })
  await ui.click(ui.container.querySelector<HTMLButtonElement>('[aria-label="Projects"]')!)
  ui.unmount()
  ui = mountReact()
  ui.render(<App />)
  expect(ui.container.querySelector('.project-hub')?.textContent).toContain('Demo saga')
  expect(getProject(project.id)?.session?.selectedIds.length).toBeGreaterThan(0)
}, 30_000)
