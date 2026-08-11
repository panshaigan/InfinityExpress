import { describe, expect, it } from 'vitest'
import {
  buildInstallOrderLines,
  buildInstallOrderText,
  countInstallOrderMods,
  normalizeExportFilename,
} from './installOrder'
import { parseInstallSequence } from '../xml/parseInstallSequence'

const SAMPLE = `<?xml version="1.0"?>
<installSequence>
  <base label="Base">
    <component id="pre:only" label="Pre only" engine="bg1,eet1" />
    <component id="both:fix" label="Both tokens" engine="bg,eet,eet1" />
    <component id="eet:only" label="EET only" engine="eet" />
    <component id="empty:engine" label="Empty engine" />
    <component id="skip:me" label="No export" engine="eet1" noExport="1" />
    <component id="bg:only" label="BG only" engine="bg1" />
  </base>
</installSequence>`

describe('buildInstallOrderLines', () => {
  const { model } = parseInstallSequence(SAMPLE)
  const selected = new Set([
    'pre:only',
    'both:fix',
    'eet:only',
    'empty:engine',
    'skip:me',
    'bg:only',
  ])

  it('exports flat document order for phase all', () => {
    expect(buildInstallOrderLines(model, selected).map((l) => l.split(';')[0])).toEqual([
      'pre:only',
      'both:fix',
      'eet:only',
      'empty:engine',
      'bg:only',
    ])
  })

  it('omits noExport even when selected', () => {
    const lines = buildInstallOrderLines(model, selected)
    expect(lines.some((l) => l.startsWith('skip:me'))).toBe(false)
  })

  it('eet1 phase includes eet1-marked components only', () => {
    expect(
      buildInstallOrderLines(model, selected, 'eet1').map((l) => l.split(';')[0]),
    ).toEqual(['pre:only', 'both:fix'])
  })

  it('eet phase includes eet-marked and empty-engine components', () => {
    expect(
      buildInstallOrderLines(model, selected, 'eet').map((l) => l.split(';')[0]),
    ).toEqual(['both:fix', 'eet:only', 'empty:engine'])
  })

  it('dual-token components appear in both eet1 and eet phases', () => {
    const pre = buildInstallOrderLines(model, selected, 'eet1').map((l) => l.split(';')[0])
    const eet = buildInstallOrderLines(model, selected, 'eet').map((l) => l.split(';')[0])
    expect(pre).toContain('both:fix')
    expect(eet).toContain('both:fix')
  })

  it('buildInstallOrderText appends trailing newline when non-empty', () => {
    expect(buildInstallOrderText(model, new Set(['eet:only']), 'eet')).toBe(
      'eet:only;EET only\n',
    )
    expect(buildInstallOrderText(model, new Set(['pre:only']), 'eet')).toBe('')
  })

  it('prefers WeiDU name over curated label for export labels', () => {
    const xml = `<?xml version="1.0"?>
<installSequence>
  <base label="Base">
    <component id="named:one" name="Real WeiDU Title" label="Short UI" engine="eet" />
    <component id="label:only" label="Label only" engine="eet" />
  </base>
</installSequence>`
    const { model: namedModel } = parseInstallSequence(xml)
    const selected = new Set(['named:one', 'label:only'])
    expect(buildInstallOrderLines(namedModel, selected, 'eet')).toEqual([
      'named:one;Real WeiDU Title',
      'label:only;Label only',
    ])
  })
})

describe('countInstallOrderMods', () => {
  it('counts distinct mods for the export phase', () => {
    const xml = `<?xml version="1.0"?>
<installSequence>
  <base label="Base">
    <mod id="ModA" label="A">
      <component id="a:1" label="A1" modId="ModA" />
      <component id="a:2" label="A2" modId="ModA" />
    </mod>
    <mod id="ModB" label="B">
      <component id="b:1" label="B1" modId="ModB" />
    </mod>
  </base>
</installSequence>`
    const { model } = parseInstallSequence(xml)
    const selected = new Set(['a:1', 'a:2', 'b:1'])
    expect(countInstallOrderMods(model, selected)).toBe(2)
    expect(countInstallOrderMods(model, new Set(['a:1']))).toBe(1)
  })
})

describe('normalizeExportFilename', () => {
  it('keeps .txt and appends when missing', () => {
    expect(normalizeExportFilename('order.txt', 'install-order.txt')).toBe('order.txt')
    expect(normalizeExportFilename('order', 'install-order.txt')).toBe('order.txt')
    expect(normalizeExportFilename('  ', 'install-order.txt')).toBe('install-order.txt')
  })

  it('uses the fallback extension for csv and log', () => {
    expect(normalizeExportFilename('mods', 'mods-export.csv')).toBe('mods.csv')
    expect(normalizeExportFilename('mods-export.csv', 'mods-export.csv')).toBe(
      'mods-export.csv',
    )
    expect(normalizeExportFilename('WeiDU-bg1', 'WeiDU-bg1.log')).toBe(
      'WeiDU-bg1.log',
    )
  })
})
