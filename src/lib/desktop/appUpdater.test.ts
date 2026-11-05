import { beforeEach, describe, expect, it, vi } from 'vitest'
import { relaunch } from '@tauri-apps/plugin-process'
import type { Update } from '@tauri-apps/plugin-updater'
import { installAppUpdate } from './appUpdater'
import { createProfileCheckpoint } from '../persistence/profileCheckpoint'

vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('../persistence/profileCheckpoint', () => ({ createProfileCheckpoint: vi.fn() }))

beforeEach(() => { vi.clearAllMocks() })

describe('app update preservation', () => {
  it('flushes saves, checkpoints the profile, and only then starts the installer', async () => {
    const order: string[] = []
    const flush = vi.fn(async () => { order.push('flush') })
    vi.mocked(createProfileCheckpoint).mockImplementation(async () => { order.push('checkpoint'); return '/backup' })
    const install = vi.fn(async () => { order.push('install') })
    vi.mocked(relaunch).mockImplementation(async () => { order.push('relaunch') })
    await installAppUpdate({ downloadAndInstall: install } as unknown as Update, flush)
    expect(order).toEqual(['flush', 'checkpoint', 'install', 'relaunch'])
  })

  it('refuses to install when a save or recovery checkpoint fails', async () => {
    const install = vi.fn()
    const update = { downloadAndInstall: install } as unknown as Update
    await expect(installAppUpdate(update, async () => { throw new Error('save failed') })).rejects.toThrow('save failed')
    expect(createProfileCheckpoint).not.toHaveBeenCalled()
    vi.mocked(createProfileCheckpoint).mockRejectedValueOnce(new Error('backup failed'))
    await expect(installAppUpdate(update, async () => {})).rejects.toThrow('backup failed')
    expect(install).not.toHaveBeenCalled()
    expect(relaunch).not.toHaveBeenCalled()
  })
})
