import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { pickDirectory, pickFile, saveTextFile } from './fsDialogs'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn(), invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isTauri).mockReturnValue(true)
  vi.mocked(open).mockResolvedValue(null)
  vi.mocked(save).mockResolvedValue(null)
  vi.mocked(writeTextFile).mockResolvedValue(undefined)
})

describe('native dialog boundary', () => {
  it('avoids invoking native plugins in browser preview', async () => {
    vi.mocked(isTauri).mockReturnValue(false)
    expect(await pickDirectory()).toBeNull()
    expect(await pickFile()).toBeNull()
    expect(await saveTextFile('out.txt', 'text')).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(writeTextFile).not.toHaveBeenCalled()
  })

  it('requests one directory and preserves its Unicode path', async () => {
    vi.mocked(open).mockResolvedValue('D:\\Games\\Zażółć gęślą')
    expect(await pickDirectory('Choose destination')).toBe('D:\\Games\\Zażółć gęślą')
    expect(open).toHaveBeenCalledExactlyOnceWith({ directory: true, multiple: false, title: 'Choose destination' })
  })

  it('requests one file rather than a directory', async () => {
    vi.mocked(open).mockResolvedValue('/tools/WeiDU.exe')
    expect(await pickFile('Choose WeiDU')).toBe('/tools/WeiDU.exe')
    expect(open).toHaveBeenCalledExactlyOnceWith({ directory: false, multiple: false, title: 'Choose WeiDU' })
  })

  it.each([null, [] as string[], ['one', 'two']])('treats cancellation or unexpected multi-select as no selection (%j)', async (value) => {
    vi.mocked(open).mockResolvedValue(value)
    expect(await pickDirectory()).toBeNull()
    expect(await pickFile()).toBeNull()
  })

  it('never writes a file when the save dialog is cancelled', async () => {
    expect(await saveTextFile('out.txt', 'text')).toBe(false)
    expect(writeTextFile).not.toHaveBeenCalled()
  })

  it.each([
    ['out.txt', 'Text', ['txt']],
    ['Mods.CSV', 'CSV', ['csv']],
  ])('uses the correct save filter for %s and writes to the chosen path', async (name, filterName, extensions) => {
    const path = 'D:/Exports/Zażółć gęślą.txt'
    vi.mocked(save).mockResolvedValue(path)
    expect(await saveTextFile(name, 'Zażółć gęślą\n')).toBe(true)
    expect(save).toHaveBeenCalledExactlyOnceWith({ defaultPath: name, filters: [{ name: filterName, extensions }] })
    expect(writeTextFile).toHaveBeenCalledExactlyOnceWith(path, 'Zażółć gęślą\n')
  })

  it('propagates a save write error so the caller cannot mistake it for success', async () => {
    vi.mocked(save).mockResolvedValue('/exports/out.txt')
    vi.mocked(writeTextFile).mockRejectedValue(new Error('Disk full'))
    await expect(saveTextFile('out.txt', 'text')).rejects.toThrow('Disk full')
  })

  it('propagates a native picker error without attempting to write', async () => {
    vi.mocked(open).mockRejectedValue('Dialog unavailable')
    await expect(pickDirectory()).rejects.toBe('Dialog unavailable')
    expect(writeTextFile).not.toHaveBeenCalled()
  })
})
