import { afterEach, describe, expect, it } from 'vitest'
import {
  DEVELOPER_MODE_STORAGE_KEY,
  readDeveloperMode,
  writeDeveloperMode,
} from './developerMode'

afterEach(() => {
  window.localStorage.removeItem(DEVELOPER_MODE_STORAGE_KEY)
})

describe('developerMode', () => {
  it('defaults to off', () => {
    expect(readDeveloperMode()).toBe(false)
  })

  it('round-trips via localStorage', () => {
    writeDeveloperMode(true)
    expect(window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY)).toBe('1')
    expect(readDeveloperMode()).toBe(true)
    writeDeveloperMode(false)
    expect(readDeveloperMode()).toBe(false)
    expect(window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY)).toBe('0')
  })
})
