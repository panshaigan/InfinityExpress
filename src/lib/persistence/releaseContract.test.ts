import { describe, expect, it } from 'vitest'
import configText from '../../../src-tauri/tauri.conf.json?raw'

describe('stable desktop profile identity', () => {
  it('keeps installer identity and WebView origin stable across releases', () => {
    const config = JSON.parse(configText)
    expect(config.identifier).toBe('com.infinityexpress.app')
    expect(config.productName).toBe('InfinityExpress')
    expect(config.app.windows[0].label).toBe('main')
    expect(config.app.windows[0].useHttpsScheme).toBe(false)
    expect(config.app.windows[0].dataDirectory).toBeUndefined()
  })
})
