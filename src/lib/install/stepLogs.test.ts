import { describe, expect, it } from 'vitest'
import {
  safeLogSegment,
  stepAttemptPaths,
  stepFolderName,
} from './stepLogs'

describe('stepLogs', () => {
  it('curates dirname-safe segments', () => {
    expect(safeLogSegment('cd_tweaks:4000')).toBe('cd_tweaks_4000')
    expect(safeLogSegment('a/b\\c')).toBe('a_b_c')
  })

  it('includes mod and component ids in the step folder', () => {
    expect(
      stepFolderName({ modId: 'Tweaks-Anthology', componentId: 'cd_tweaks_x' }, 11),
    ).toBe('012-Tweaks-Anthology-cd_tweaks_x')
  })

  it('builds attempt paths with mod/component stems', () => {
    expect(stepAttemptPaths('D:/logs/run/001-m-c', 2)).toEqual({
      modPath: 'D:/logs/run/001-m-c/mod-2.log',
      componentPath: 'D:/logs/run/001-m-c/component-2.log',
      resultsPath: 'D:/logs/run/001-m-c/results-2.log',
    })
  })
})
