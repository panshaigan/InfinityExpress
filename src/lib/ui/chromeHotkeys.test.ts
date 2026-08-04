import { describe, expect, it } from 'vitest'
import {
  cycleStation,
  cycleTabIndex,
  isTypingTarget,
  resolveChromeHotkey,
  stationCycleOrder,
} from './chromeHotkeys'

describe('stationCycleOrder / cycleStation', () => {
  it('puts engine first then visible stations', () => {
    expect(stationCycleOrder(['base', 'ui'])).toEqual(['engine', 'base', 'ui'])
  })

  it('cycles with wrap', () => {
    const order = stationCycleOrder(['base', 'ui'])
    expect(cycleStation(order, 'engine', 1)).toBe('base')
    expect(cycleStation(order, 'ui', 1)).toBe('engine')
    expect(cycleStation(order, 'base', -1)).toBe('engine')
    expect(cycleStation(order, 'engine', -1)).toBe('ui')
  })
})

describe('resolveChromeHotkey', () => {
  const idle = {
    isTypingTarget: false,
    filterPanelOpen: false,
    searchFocused: false,
    contentStationActive: false,
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
    const content = { ...idle, contentStationActive: true }
    expect(resolveChromeHotkey(',', content)).toEqual({
      type: 'cycleContentMain',
      direction: -1,
    })
    expect(resolveChromeHotkey('.', content)).toEqual({
      type: 'cycleContentMain',
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
