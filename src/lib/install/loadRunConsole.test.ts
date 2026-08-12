import { describe, expect, it } from 'vitest'
import { mergeRunLogLines } from './loadRunConsole'

describe('loadRunConsole', () => {
  it('merges stdout and stderr into console lines', () => {
    const { consoleLines } = mergeRunLogLines('line one\nline two', 'error line')
    expect(consoleLines).toEqual(['line one', 'line two', 'error line'])
  })

  it('derives result lines from highlight keywords', () => {
    const { resultLines } = mergeRunLogLines(
      'Installing component\nSuccessfully installed',
      'WARNING: something',
    )
    expect(resultLines).toEqual(['Successfully installed', 'WARNING: something'])
  })

  it('returns empty arrays for missing logs', () => {
    const { consoleLines, resultLines } = mergeRunLogLines(null, null)
    expect(consoleLines).toEqual([])
    expect(resultLines).toEqual([])
  })
})
