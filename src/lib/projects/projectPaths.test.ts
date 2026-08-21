import { describe, expect, it, beforeEach } from 'vitest'
import {
  allocateUniqueFolderName,
  formatRunStamp,
  installRunLogDir,
  newInstallRunId,
  projectDir,
  modsRoot,
  projectsRoot,
  resetRunStampSeqForTests,
  sanitizeProjectFolderName,
} from './projectPaths'

describe('projectPaths', () => {
  beforeEach(() => {
    resetRunStampSeqForTests()
  })

  it('joins projects root and dated run folders under the data folder', () => {
    expect(projectsRoot('D:/ie-data')).toBe('D:/ie-data/projects')
    expect(projectsRoot('D:/ie-data/')).toBe('D:/ie-data/projects')
    expect(projectsRoot('D:\\ie-data\\')).toBe('D:/ie-data/projects')
    expect(modsRoot('D:/ie-data')).toBe('D:/ie-data/mods')
    expect(modsRoot('D:/ie-data/')).toBe('D:/ie-data/mods')
    expect(modsRoot('D:\\ie-data\\')).toBe('D:/ie-data/mods')
    expect(projectDir('D:/ie-data', 'My EET')).toBe('D:/ie-data/projects/My EET')
    expect(installRunLogDir('D:/ie-data', 'My EET', '2026-08-21_15-30-45')).toBe(
      'D:/ie-data/projects/My EET/2026-08-21_15-30-45',
    )
  })

  it('rejects empty or separator-containing segments', () => {
    expect(() => projectDir('D:/ie-data', '')).toThrow(/folderName/)
    expect(() => projectDir('D:/ie-data', 'a/b')).toThrow(/path separator/)
    expect(() => projectDir('D:/ie-data', 'a\\b')).toThrow(/path separator/)
    expect(() => installRunLogDir('D:/ie-data', 'proj-1', '')).toThrow(/runId/)
    expect(() => installRunLogDir('D:/ie-data', 'proj-1', 'run/1')).toThrow(
      /path separator/,
    )
  })

  it('sanitizes project folder names for Windows', () => {
    expect(sanitizeProjectFolderName('EET · 2026-08-21')).toBe('EET · 2026-08-21')
    expect(sanitizeProjectFolderName('a<b>:"/\\|?*c')).toBe('a_b________c')
    expect(sanitizeProjectFolderName('  ...  ')).toBe('project')
    expect(sanitizeProjectFolderName('con')).toBe('_con')
  })

  it('allocates unique folder names on collision', () => {
    expect(allocateUniqueFolderName('Alpha', ['Alpha'])).toBe('Alpha (2)')
    expect(allocateUniqueFolderName('Alpha', ['Alpha', 'Alpha (2)'])).toBe(
      'Alpha (3)',
    )
  })

  it('formats run stamps and sequences same-second ids', () => {
    const d = new Date(2026, 7, 21, 15, 30, 45)
    expect(formatRunStamp(d)).toBe('2026-08-21_15-30-45')
    expect(newInstallRunId(d)).toBe('2026-08-21_15-30-45')
    expect(newInstallRunId(d)).toBe('2026-08-21_15-30-45-2')
  })
})
