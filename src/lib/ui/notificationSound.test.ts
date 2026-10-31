import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('notification sounds', () => {
  const start = vi.fn()
  const stop = vi.fn()
  const decode = vi.fn(async (data: ArrayBuffer) => data)
  const resume = vi.fn(async () => {})
  const source = vi.fn(() => ({ start, stop, connect: vi.fn(), disconnect: vi.fn() }))

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      destination = {}
      resume = resume
      decodeAudioData = decode
      createBufferSource = source
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('groups a burst, prioritizes errors, and allows a later notification', async () => {
    const { requestNotificationSound } = await import('./notificationSound')
    requestNotificationSound('success')
    requestNotificationSound('error')
    requestNotificationSound('success')
    await vi.advanceTimersByTimeAsync(150)
    expect(start).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('error.wav'))
    requestNotificationSound('success')
    await vi.advanceTimersByTimeAsync(1500)
    expect(start).toHaveBeenCalledTimes(1)
    requestNotificationSound('success')
    await vi.advanceTimersByTimeAsync(150)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('defaults to enabled, persists mute, and lets previews bypass it', async () => {
    const prefs = await import('./notificationPrefs')
    const sound = await import('./notificationSound')
    expect(prefs.readNotificationSounds()).toBe(true)
    prefs.writeNotificationSounds(false)
    expect(localStorage.getItem('infinity-express.notification-sounds')).toBe('0')
    sound.requestNotificationSound('success')
    await vi.advanceTimersByTimeAsync(200)
    expect(start).not.toHaveBeenCalled()
    await sound.previewNotificationSound('success')
    expect(start).toHaveBeenCalledOnce()
  })

  it('cancels pending audio on mute or provider cleanup', async () => {
    const sound = await import('./notificationSound')
    const prefs = await import('./notificationPrefs')
    sound.requestNotificationSound('success')
    prefs.writeNotificationSounds(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(start).not.toHaveBeenCalled()
    prefs.writeNotificationSounds(true)
    sound.requestNotificationSound('error')
    sound.cancelPendingNotificationSound()
    await vi.advanceTimersByTimeAsync(200)
    expect(start).not.toHaveBeenCalled()
  })

  it('primes audio during interaction and reuses decoded chimes', async () => {
    const sound = await import('./notificationSound')
    sound.unlockNotificationAudio()
    await sound.previewNotificationSound('success')
    await sound.previewNotificationSound('success')
    expect(resume).toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(stop).toHaveBeenCalledOnce()
  })

  it('reports preview loading failures, retries, and contains automatic failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('load failed'))
    const sound = await import('./notificationSound')
    await expect(sound.previewNotificationSound('success')).rejects.toThrow('load failed')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sound.requestNotificationSound('success')
    await vi.advanceTimersByTimeAsync(200)
    expect(warning).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
    warning.mockRestore()
  })
})
