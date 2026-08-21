import { describe, expect, it } from 'vitest'
import { INSTALL_CONSOLE_MAX_LINES } from './consoleLimits'
import { mergeRunLogLines } from './loadRunConsole'

describe('loadRunConsole', () => {
  it('merges stdout and stderr into console lines', () => {
    const { consoleLines } = mergeRunLogLines('line one\nline two', 'error line')
    expect(consoleLines).toEqual(['line one', 'line two', 'error line'])
  })

  it('loads command and result lines from their own files', () => {
    const { commandLines, resultLines } = mergeRunLogLines(
      'Installing component\nSuccessfully installed',
      'WARNING: something',
      'setup.exe --force-install 1',
      'Successfully installed\nWARNING: something',
    )
    expect(commandLines).toEqual(['setup.exe --force-install 1'])
    expect(resultLines).toEqual(['Successfully installed', 'WARNING: something'])
  })

  it('returns empty arrays for missing logs', () => {
    const { consoleLines, commandLines, resultLines } = mergeRunLogLines(
      null,
      null,
    )
    expect(consoleLines).toEqual([])
    expect(commandLines).toEqual([])
    expect(resultLines).toEqual([])
  })

  it('trims console lines to the display cap', () => {
    const stdout = Array.from(
      { length: INSTALL_CONSOLE_MAX_LINES + 50 },
      (_, i) => `line ${i}`,
    ).join('\n')
    const { consoleLines } = mergeRunLogLines(stdout, null)
    expect(consoleLines).toHaveLength(INSTALL_CONSOLE_MAX_LINES)
    expect(consoleLines[0]).toBe('line 50')
    expect(consoleLines.at(-1)).toBe(`line ${INSTALL_CONSOLE_MAX_LINES + 49}`)
  })

  it('trims command and result lines to the display cap', () => {
    const many = Array.from(
      { length: INSTALL_CONSOLE_MAX_LINES + 10 },
      (_, i) => `cmd ${i}`,
    ).join('\n')
    const { commandLines, resultLines } = mergeRunLogLines(null, null, many, many)
    expect(commandLines).toHaveLength(INSTALL_CONSOLE_MAX_LINES)
    expect(resultLines).toHaveLength(INSTALL_CONSOLE_MAX_LINES)
    expect(commandLines[0]).toBe('cmd 10')
    expect(resultLines.at(-1)).toBe(`cmd ${INSTALL_CONSOLE_MAX_LINES + 9}`)
  })
})
