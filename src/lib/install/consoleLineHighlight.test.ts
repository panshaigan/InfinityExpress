import { describe, expect, it } from 'vitest'
import { consoleLineTone, stripConsoleTs } from './consoleLineHighlight'

describe('consoleLineTone', () => {
  it('detects errors including plurals', () => {
    expect(consoleLineTone('ERROR: boom')).toBe('error')
    expect(consoleLineTone('Error: boom')).toBe('error')
    expect(consoleLineTone('Not installed due to errors')).toBe('error')
  })

  it('rejects error embedded in alphanumeric tokens', () => {
    expect(consoleLineTone('[EET\\temp\\wav/ERROR10.WAV')).toBeNull()
    expect(consoleLineTone('Error122341')).toBeNull()
    expect(consoleLineTone('path/to/ERROR10.WAV copied')).toBeNull()
  })

  it('detects warnings including plurals', () => {
    expect(consoleLineTone('WARNING: soft')).toBe('warning')
    expect(consoleLineTone('Installed with warnings')).toBe('warning')
  })

  it('rejects warning embedded in alphanumeric tokens', () => {
    expect(consoleLineTone('WARNING10.log')).toBeNull()
    expect(consoleLineTone('Warning123')).toBeNull()
  })

  it('detects successfully / successful', () => {
    expect(consoleLineTone('SUCCESSFULLY installed cdtweaks')).toBe('success')
    expect(consoleLineTone('Installed successfully')).toBe('success')
    expect(consoleLineTone('Successful install')).toBe('success')
  })

  it('detects skipped', () => {
    expect(consoleLineTone('SKIPPED component 12')).toBe('skipped')
  })

  it('prioritizes error over warning and success', () => {
    expect(consoleLineTone('error with warning successfully')).toBe('error')
    expect(consoleLineTone('warning but successfully')).toBe('warning')
  })

  it('ignores timestamp prefix when classifying', () => {
    expect(consoleLineTone('[14:32:05] Successfully installed')).toBe('success')
    expect(consoleLineTone('[9:01:02] ERROR: fail')).toBe('error')
  })

  it('returns null for ordinary lines', () => {
    expect(consoleLineTone('Copying files…')).toBeNull()
    expect(consoleLineTone('')).toBeNull()
  })
})

describe('stripConsoleTs', () => {
  it('removes leading timestamp', () => {
    expect(stripConsoleTs('[14:32:05] hello')).toBe('hello')
  })
})
