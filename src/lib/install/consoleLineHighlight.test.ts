import { describe, expect, it } from 'vitest'
import {
  consoleLineTone,
  splitCommandLineBody,
  splitConsoleTs,
  stripConsoleTs,
  weiduOutputIndicatesSkipped,
} from './consoleLineHighlight'

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
    expect(consoleLineTone('SKIPPING: [Not BG2]')).toBe('skipped')
  })

  it('weiduOutputIndicatesSkipped matches SKIPPING:', () => {
    expect(weiduOutputIndicatesSkipped('SKIPPING: [Compatibility]')).toBe(true)
    expect(weiduOutputIndicatesSkipped('[14:32:05] SKIPPING: foo')).toBe(true)
    expect(weiduOutputIndicatesSkipped('Installed with warnings')).toBe(false)
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

describe('splitConsoleTs', () => {
  it('splits stamped lines', () => {
    expect(splitConsoleTs('[14:32:05] hello')).toEqual({
      ts: '[14:32:05]',
      body: 'hello',
    })
  })

  it('returns null ts when unstamped', () => {
    expect(splitConsoleTs('hello')).toEqual({ ts: null, body: 'hello' })
  })
})

describe('splitCommandLineBody', () => {
  it('colors leading tags on status lines', () => {
    expect(splitCommandLineBody('[stage] Copying files…')).toEqual([
      { text: '[stage]', kind: 'tag' },
      { text: ' ', kind: 'plain' },
      { text: 'Copying files…', kind: 'plain' },
    ])
    expect(splitCommandLineBody('[uninstall] Finished cdtweaks')).toEqual([
      { text: '[uninstall]', kind: 'tag' },
      { text: ' ', kind: 'plain' },
      { text: 'Finished cdtweaks', kind: 'plain' },
    ])
  })

  it('colors cwd tag and WeiDU path on logged commands', () => {
    expect(
      splitCommandLineBody(
        '[D:\\games\\bg2ee] "D:\\tools\\WeiDU\\weidu.exe" --force-install 4000',
      ),
    ).toEqual([
      { text: '[D:\\games\\bg2ee]', kind: 'tag' },
      { text: ' ', kind: 'plain' },
      { text: '"D:\\tools\\WeiDU\\weidu.exe"', kind: 'path' },
      { text: ' --force-install 4000', kind: 'plain' },
    ])
  })

  it('colors unquoted setup.exe paths', () => {
    expect(
      splitCommandLineBody('[C:\\BG2] C:\\BG2\\setup-cdtweaks.exe --force-uninstall 1'),
    ).toEqual([
      { text: '[C:\\BG2]', kind: 'tag' },
      { text: ' ', kind: 'plain' },
      { text: 'C:\\BG2\\setup-cdtweaks.exe', kind: 'path' },
      { text: ' --force-uninstall 1', kind: 'plain' },
    ])
  })

  it('leaves plain lines unchanged', () => {
    expect(splitCommandLineBody('Installation started')).toEqual([
      { text: 'Installation started', kind: 'plain' },
    ])
  })
})
