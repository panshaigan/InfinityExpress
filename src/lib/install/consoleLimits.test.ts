import { describe, expect, it } from 'vitest'
import { INSTALL_CONSOLE_MAX_LINES, trimConsoleLines } from './consoleLimits'

describe('consoleLimits', () => {
  it('returns a copy when under the cap', () => {
    const lines = ['a', 'b']
    expect(trimConsoleLines(lines)).toEqual(['a', 'b'])
    expect(trimConsoleLines(lines)).not.toBe(lines)
  })

  it('keeps only the last N lines at the cap', () => {
    const lines = Array.from({ length: INSTALL_CONSOLE_MAX_LINES + 3 }, (_, i) => `${i}`)
    const trimmed = trimConsoleLines(lines)
    expect(trimmed).toHaveLength(INSTALL_CONSOLE_MAX_LINES)
    expect(trimmed[0]).toBe('3')
    expect(trimmed.at(-1)).toBe(`${INSTALL_CONSOLE_MAX_LINES + 2}`)
  })
})
