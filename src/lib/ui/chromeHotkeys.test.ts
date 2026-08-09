import { describe, expect, it } from 'vitest'
import {
  cycleStation,
  cycleTabIndex,
  isDocumentShellFocused,
  isTypingTarget,
  resolveChromeHotkey,
  stationCycleOrder,
} from './chromeHotkeys'

describe('stationCycleOrder / cycleStation', () => {
  it('puts engine then presets then visible stations', () => {
    expect(stationCycleOrder(['base', 'ui'])).toEqual([
      'engine',
      'presets',
      'base',
      'ui',
    ])
  })

  it('cycles with wrap', () => {
    const order = stationCycleOrder(['base', 'ui'])
    expect(cycleStation(order, 'engine', 1)).toBe('presets')
    expect(cycleStation(order, 'presets', 1)).toBe('base')
    expect(cycleStation(order, 'ui', 1)).toBe('engine')
    expect(cycleStation(order, 'base', -1)).toBe('presets')
    expect(cycleStation(order, 'presets', -1)).toBe('engine')
    expect(cycleStation(order, 'engine', -1)).toBe('ui')
  })
})

describe('resolveChromeHotkey', () => {
  const idle = {
    isTypingTarget: false,
    filterPanelOpen: false,
    searchFocused: false,
    branchMainCycleActive: false,
    contentSubCycleActive: false,
    shiftKey: false,
  }

  it('maps [ ] / Esc and /', () => {
    expect(resolveChromeHotkey('[', idle)).toEqual({
      type: 'cycleStation',
      direction: -1,
    })
    expect(resolveChromeHotkey(']', idle)).toEqual({
      type: 'cycleStation',
      direction: 1,
    })
    expect(resolveChromeHotkey('/', idle)).toEqual({ type: 'focusSearch' })
    expect(resolveChromeHotkey('Escape', idle)).toBeNull()
  })

  it('Escape when panel open or search focused', () => {
    expect(
      resolveChromeHotkey('Escape', { ...idle, filterPanelOpen: true }),
    ).toEqual({ type: 'escapeChrome' })
    expect(
      resolveChromeHotkey('Escape', { ...idle, searchFocused: true }),
    ).toEqual({ type: 'escapeChrome' })
  })

  it('suppresses station keys while typing but still allows /', () => {
    const typing = { ...idle, isTypingTarget: true }
    expect(resolveChromeHotkey('[', typing)).toBeNull()
    expect(resolveChromeHotkey('/', typing)).toEqual({ type: 'focusSearch' })
  })

  it('does not steal / when search already focused', () => {
    expect(
      resolveChromeHotkey('/', { ...idle, searchFocused: true }),
    ).toBeNull()
  })

  it('cycles Content branches with ,/. and Shift variants', () => {
    const content = {
      ...idle,
      branchMainCycleActive: true,
      contentSubCycleActive: true,
    }
    expect(resolveChromeHotkey(',', content)).toEqual({
      type: 'cycleBranchMain',
      direction: -1,
    })
    expect(resolveChromeHotkey('.', content)).toEqual({
      type: 'cycleBranchMain',
      direction: 1,
    })
    expect(resolveChromeHotkey('<', content)).toEqual({
      type: 'cycleContentSub',
      direction: -1,
    })
    expect(resolveChromeHotkey('>', content)).toEqual({
      type: 'cycleContentSub',
      direction: 1,
    })
    expect(resolveChromeHotkey(',', { ...content, shiftKey: true })).toEqual({
      type: 'cycleContentSub',
      direction: -1,
    })
    expect(resolveChromeHotkey('.', idle)).toBeNull()
  })

  it('cycles Mechanics categories with ,/. but not sub keys', () => {
    const mechanics = {
      ...idle,
      branchMainCycleActive: true,
      contentSubCycleActive: false,
    }
    expect(resolveChromeHotkey(',', mechanics)).toEqual({
      type: 'cycleBranchMain',
      direction: -1,
    })
    expect(resolveChromeHotkey('.', mechanics)).toEqual({
      type: 'cycleBranchMain',
      direction: 1,
    })
    expect(resolveChromeHotkey('<', mechanics)).toBeNull()
    expect(resolveChromeHotkey('>', mechanics)).toBeNull()
    expect(resolveChromeHotkey(',', { ...mechanics, shiftKey: true })).toEqual({
      type: 'cycleBranchMain',
      direction: -1,
    })
  })
})

describe('cycleTabIndex', () => {
  it('wraps within tablist', () => {
    expect(cycleTabIndex(3, 0, 1)).toBe(1)
    expect(cycleTabIndex(3, 2, 1)).toBe(0)
    expect(cycleTabIndex(3, 0, -1)).toBe(2)
  })
})

describe('isTypingTarget', () => {
  it('detects text inputs', () => {
    const input = document.createElement('input')
    input.type = 'search'
    expect(isTypingTarget(input)).toBe(true)

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    expect(isTypingTarget(checkbox)).toBe(false)
  })
})

describe('isDocumentShellFocused', () => {
  it('is true for null, body, and html', () => {
    expect(isDocumentShellFocused(null)).toBe(true)
    expect(isDocumentShellFocused(document.body)).toBe(true)
    expect(isDocumentShellFocused(document.documentElement)).toBe(true)
  })

  it('is false for interactive elements', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    expect(isDocumentShellFocused(btn)).toBe(false)
    btn.remove()
  })
})
