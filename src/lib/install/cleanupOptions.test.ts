import { describe, expect, it } from 'vitest'
import {
  defaultCleanupSelection,
  hasAnyCleanupSelection,
  showBg1FolderCleanupOption,
} from './cleanupOptions'

describe('cleanupOptions', () => {
  it('defaults all artifacts on and BG1 off', () => {
    const d = defaultCleanupSelection()
    expect(d.modFolders).toBe(true)
    expect(d.setupExes).toBe(true)
    expect(d.debugFiles).toBe(true)
    expect(d.weiduExternal).toBe(true)
    expect(d.zstweaksLogs).toBe(true)
    expect(d.weiduConf).toBe(true)
    expect(d.bg1Folder).toBe(false)
    expect(hasAnyCleanupSelection(d)).toBe(true)
  })

  it('hasAnyCleanupSelection ignores bg1 unless shown', () => {
    const none = {
      modFolders: false,
      setupExes: false,
      debugFiles: false,
      weiduExternal: false,
      zstweaksLogs: false,
      weiduConf: false,
      bg1Folder: true,
    }
    expect(hasAnyCleanupSelection(none)).toBe(false)
    expect(hasAnyCleanupSelection(none, { showBg1Folder: true })).toBe(true)
  })

  it('showBg1FolderCleanupOption requires EET and a path', () => {
    expect(showBg1FolderCleanupOption('eet', 'D:/games/bg1')).toBe(true)
    expect(showBg1FolderCleanupOption('eet', '  ')).toBe(false)
    expect(showBg1FolderCleanupOption('bg2', 'D:/games/bg1')).toBe(false)
    expect(showBg1FolderCleanupOption(null, 'D:/games/bg1')).toBe(false)
  })
})
