import { describe, expect, it } from 'vitest'
import {
  installRunLogDir,
  projectDir,
  projectLogsDir,
  projectsRoot,
} from './projectPaths'

describe('projectPaths', () => {
  it('joins projects root and per-project logs under the data folder', () => {
    expect(projectsRoot('D:/ie-data')).toBe('D:/ie-data/projects')
    expect(projectsRoot('D:/ie-data/')).toBe('D:/ie-data/projects')
    expect(projectsRoot('D:\\ie-data\\')).toBe('D:/ie-data/projects')
    expect(projectDir('D:/ie-data', 'proj-1')).toBe('D:/ie-data/projects/proj-1')
    expect(projectLogsDir('D:/ie-data', 'proj-1')).toBe(
      'D:/ie-data/projects/proj-1/logs',
    )
    expect(installRunLogDir('D:/ie-data', 'proj-1', 'run-9')).toBe(
      'D:/ie-data/projects/proj-1/logs/run-9',
    )
  })

  it('rejects empty or separator-containing ids', () => {
    expect(() => projectDir('D:/ie-data', '')).toThrow(/projectId/)
    expect(() => projectLogsDir('D:/ie-data', 'a/b')).toThrow(/path separator/)
    expect(() => projectLogsDir('D:/ie-data', 'a\\b')).toThrow(/path separator/)
    expect(() => installRunLogDir('D:/ie-data', 'proj-1', '')).toThrow(/runId/)
    expect(() => installRunLogDir('D:/ie-data', 'proj-1', 'run/1')).toThrow(
      /path separator/,
    )
  })
})
