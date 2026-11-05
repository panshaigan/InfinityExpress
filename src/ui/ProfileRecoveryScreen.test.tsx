import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountReact } from '../test/react'
import { ProfileRecoveryScreen } from './ProfileRecoveryScreen'
import { pickFile, readOptionalTextFile } from '../lib/desktop/fsDialogs'
import { parseProfileRecovery, restoreProfileRecovery, type ProfileRecovery } from '../lib/persistence/profileRecovery'

vi.mock('../lib/desktop/fsDialogs', () => ({ isDesktopApp: () => true, pickFile: vi.fn(), readOptionalTextFile: vi.fn() }))
vi.mock('../lib/persistence/profileRecovery', () => ({ parseProfileRecovery: vi.fn(), restoreProfileRecovery: vi.fn() }))

describe('startup profile recovery', () => {
  let ui: ReturnType<typeof mountReact>
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.resetAllMocks()
    ui = mountReact()
    ui.render(<ProfileRecoveryScreen error="Unsupported saved data" />)
  })
  afterEach(() => { ui.unmount(); vi.unstubAllGlobals() })

  it('previews a selected backup and restores only after explicit confirmation', async () => {
    const backup = { appVersion: '1.0.0', createdAt: '2026-11-05' } as ProfileRecovery
    vi.mocked(pickFile).mockResolvedValue('/backup.json')
    vi.mocked(readOptionalTextFile).mockResolvedValue('backup contents')
    vi.mocked(parseProfileRecovery).mockResolvedValue(backup)
    // A failure keeps this test in the recovery UI and exercises its retry path.
    vi.mocked(restoreProfileRecovery).mockRejectedValue(new Error('disk full'))
    await ui.click(ui.button('Choose profile backup'))
    expect(ui.container.textContent).toContain('2026-11-05')
    expect(restoreProfileRecovery).not.toHaveBeenCalled()
    await ui.click(ui.button('Cancel'))
    expect(restoreProfileRecovery).not.toHaveBeenCalled()
    await ui.click(ui.button('Choose profile backup'))
    await ui.click(ui.button('Restore profile'))
    expect(restoreProfileRecovery).toHaveBeenCalledExactlyOnceWith(backup)
    expect(ui.container.textContent).toContain('disk full')
    expect(ui.button('Choose profile backup').disabled).toBe(false)
  })

  it('keeps data untouched when the picker is cancelled or validation fails', async () => {
    vi.mocked(pickFile).mockResolvedValueOnce(null)
    await ui.click(ui.button('Choose profile backup'))
    expect(readOptionalTextFile).not.toHaveBeenCalled()
    vi.mocked(pickFile).mockResolvedValueOnce('/bad.json')
    vi.mocked(readOptionalTextFile).mockResolvedValueOnce('bad data')
    vi.mocked(parseProfileRecovery).mockRejectedValueOnce(new Error('damaged backup'))
    await ui.click(ui.button('Choose profile backup'))
    expect(ui.container.textContent).toContain('damaged backup')
    expect(restoreProfileRecovery).not.toHaveBeenCalled()
    expect(ui.container.querySelector('[role="dialog"]')).toBeNull()
  })
})
