// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBufferedConsoleLines } from './useBufferedConsoleLines'

describe('buffered installation console', () => {
  let root: Root
  let current: ReturnType<typeof useBufferedConsoleLines>
  let renders: number

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    renders = 0
    root = createRoot(document.createElement('div'))
    function Console() {
      current = useBufferedConsoleLines()
      renders++
      return null
    }
    act(() => root.render(createElement(Console)))
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('handles a 50,000-line burst in one render and keeps the final 800 lines', () => {
    act(() => {
      for (let i = 0; i < 50_000; i += 100) {
        current[2](Array.from({ length: 100 }, (_, j) => `${i + j}`))
      }
    })
    expect(renders).toBe(1)
    act(() => vi.advanceTimersByTime(100))
    expect(renders).toBe(2)
    expect(current[0]).toHaveLength(800)
    expect(current[0][0]).toBe('49200')
    expect(current[0].at(-1)).toBe('49999')
  })

  it('discards pending output when resetting or loading another run', () => {
    act(() => {
      current[2](['old run'])
      current[1](['loaded run'])
      vi.advanceTimersByTime(100)
    })
    expect(current[0]).toEqual(['loaded run'])
    act(() => {
      current[2](['new run'])
      vi.advanceTimersByTime(100)
    })
    expect(current[0]).toEqual(['loaded run', 'new run'])
  })

  it('cancels scheduled updates on unmount', () => {
    act(() => current[2](['pending']))
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
  })
})
