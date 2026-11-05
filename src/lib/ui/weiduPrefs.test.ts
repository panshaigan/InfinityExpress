import { afterEach, describe, expect, it } from 'vitest'
import { readWeiduPath, usesBundledWeiduPath, writeBundledWeiduPath, writeWeiduPath } from './weiduPrefs'

afterEach(() => localStorage.clear())

describe('WeiDU path across app updates', () => {
  it('refreshes auto-seeded bundled paths when the app location changes', () => {
    expect(usesBundledWeiduPath()).toBe(true)
    writeBundledWeiduPath('/tmp/.mount_old/weidu/weidu')
    expect(usesBundledWeiduPath()).toBe(true)
    writeBundledWeiduPath('/tmp/.mount_new/weidu/weidu')
    expect(readWeiduPath()).toBe('/tmp/.mount_new/weidu/weidu')
  })

  it('preserves custom and untracked legacy paths instead of replacing user settings', () => {
    writeBundledWeiduPath('/bundle/weidu')
    writeWeiduPath('/custom/weidu')
    expect(usesBundledWeiduPath()).toBe(false)
    localStorage.setItem('infinity-express.weidu-path', '/legacy/weidu')
    expect(usesBundledWeiduPath()).toBe(false)
    writeWeiduPath('')
    expect(usesBundledWeiduPath()).toBe(true)
  })
})
