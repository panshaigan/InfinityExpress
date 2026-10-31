import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GameShortcutsDialog } from './GameShortcutsDialog'
import { openFolderPath } from '../../lib/desktop/openPath'
import { launchProjectGame, openGameDocuments } from '../../lib/desktop/gameShortcuts'

vi.mock('../../lib/desktop/fsDialogs', () => ({ isDesktopApp: () => true }))
vi.mock('../../lib/desktop/openPath', () => ({ openFolderPath: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/desktop/gameShortcuts', () => ({
  launchProjectGame: vi.fn().mockResolvedValue(undefined),
  openGameDocuments: vi.fn().mockResolvedValue(undefined),
}))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function render(launchBlocked = false) {
  act(() => root.render(<GameShortcutsDialog game="eet" gameFolders={{ bg1: 'D:/BG1', bg2: 'D:/EET', iwd: '', pst: '' }} dataPath="D:/IE" launchBlocked={launchBlocked} onClose={() => {}} />))
}
function button(scope: Element, label: string) {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent === label)!
}

it('routes both EET game folders, save folders, and launches to their own paths', async () => {
  render()
  const sections = container.querySelectorAll('section')
  for (const [index, key, path] of [[0, 'bg1', 'D:/BG1'], [1, 'bg2', 'D:/EET']] as const) {
    await act(async () => button(sections[index], 'Open game folder').click())
    expect(openFolderPath).toHaveBeenLastCalledWith(path)
    await act(async () => button(sections[index], 'Open savegame folder').click())
    expect(openGameDocuments).toHaveBeenLastCalledWith(path)
    await act(async () => button(sections[index], 'Run game').click())
    expect(launchProjectGame).toHaveBeenLastCalledWith(path, key)
  }
  await act(async () => button(container, 'Open app data folder').click())
  expect(openFolderPath).toHaveBeenLastCalledWith('D:/IE')
})

it('blocks launches during installation while keeping folder shortcuts available', () => {
  render(true)
  for (const section of container.querySelectorAll('section')) {
    expect(button(section, 'Run game').disabled).toBe(true)
    expect(button(section, 'Open game folder').disabled).toBe(false)
  }
})

it('reports native errors and allows retrying', async () => {
  vi.mocked(openGameDocuments).mockRejectedValueOnce('Savegame folder does not exist yet')
  render()
  await act(async () => button(container, 'Open savegame folder').click())
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Savegame folder does not exist yet')
  expect(button(container, 'Open savegame folder').disabled).toBe(false)
  await act(async () => button(container, 'Open savegame folder').click())
  expect(container.querySelector('[role="alert"]')).toBeNull()
})
