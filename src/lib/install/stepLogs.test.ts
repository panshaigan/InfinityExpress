import { describe, expect, it } from 'vitest'
import {
  safeLogSegment,
  stepStreamPaths,
  stepStreamStem,
  stepStreamStemFromFolder,
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

  it('builds single named stream paths with mod/component stem', () => {
    expect(
      stepStreamPaths('D:/logs/run/012-Tweaks-Anthology-cd_tweaks_x', {
        modId: 'Tweaks-Anthology',
        componentId: 'cd_tweaks_x',
      }),
    ).toEqual({
      modPath:
        'D:/logs/run/012-Tweaks-Anthology-cd_tweaks_x/Tweaks-Anthology-cd_tweaks_x-mod.log',
      componentPath:
        'D:/logs/run/012-Tweaks-Anthology-cd_tweaks_x/Tweaks-Anthology-cd_tweaks_x-component.log',
      resultsPath:
        'D:/logs/run/012-Tweaks-Anthology-cd_tweaks_x/Tweaks-Anthology-cd_tweaks_x-results.log',
    })
  })

  it('derives stream stem from step folder', () => {
    expect(stepStreamStemFromFolder('012-Tweaks-Anthology-cd_tweaks_x')).toBe(
      'Tweaks-Anthology-cd_tweaks_x',
    )
    expect(
      stepStreamStem({ modId: 'Tweaks-Anthology', componentId: 'cd_tweaks_x' }),
    ).toBe('Tweaks-Anthology-cd_tweaks_x')
  })
})
