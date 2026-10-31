import successUrl from '../../assets/sounds/success.wav'
import errorUrl from '../../assets/sounds/error.wav'
import { readNotificationSounds } from './notificationPrefs'

export type NotificationSoundKind = 'success' | 'error'
const urls = { success: successUrl, error: errorUrl }
let context: AudioContext | undefined
const buffers = new Map<NotificationSoundKind, Promise<AudioBuffer>>()
let activeSource: AudioBufferSourceNode | undefined
let pendingKind: NotificationSoundKind | undefined
let pendingTimer: ReturnType<typeof setTimeout> | undefined
let lastPlayedAt = -Infinity

function getContext(): AudioContext {
  if (!context || context.state === 'closed') {
    context = new AudioContext()
    buffers.clear()
  }
  return context
}

function loadBuffer(kind: NotificationSoundKind): Promise<AudioBuffer> {
  let buffer = buffers.get(kind)
  if (!buffer) {
    const audio = getContext()
    buffer = fetch(urls[kind]).then(async (response) => {
      if (!response.ok) throw new Error('Could not load notification sound.')
      return audio.decodeAudioData(await response.arrayBuffer())
    }).catch((error: unknown) => {
      buffers.delete(kind)
      throw error
    })
    buffers.set(kind, buffer)
  }
  return buffer
}

/** Called during user interaction so later background completions can play. */
export function unlockNotificationAudio(): void {
  try {
    void getContext().resume().catch(() => {})
    for (const kind of ['success', 'error'] as const) {
      void loadBuffer(kind).catch(() => {})
    }
  } catch {
    // Preview reports audio support / playback errors to the user.
  }
}

/** Preview bypasses mute, but uses exactly the same playback path as notifications. */
export async function previewNotificationSound(kind: NotificationSoundKind): Promise<void> {
  const audio = getContext()
  await audio.resume()
  const buffer = await loadBuffer(kind)
  if (audio.state !== 'running') throw new Error('Audio is unavailable. Try previewing again.')
  activeSource?.stop()
  const source = audio.createBufferSource()
  source.buffer = buffer
  source.connect(audio.destination)
  source.onended = () => {
    source.disconnect()
    if (activeSource === source) activeSource = undefined
  }
  activeSource = source
  source.start()
}

/** Group bursts for 150 ms (errors take priority), then stay quiet for 1.5 s. */
export function requestNotificationSound(kind: NotificationSoundKind): void {
  if (!readNotificationSounds() || Date.now() - lastPlayedAt < 1500) return
  if (pendingKind !== 'error') pendingKind = kind
  if (pendingTimer !== undefined) return
  pendingTimer = setTimeout(() => {
    const next = pendingKind!
    pendingTimer = undefined
    pendingKind = undefined
    if (!readNotificationSounds()) return
    lastPlayedAt = Date.now()
    void previewNotificationSound(next).catch((error: unknown) => {
      console.warn('Notification sound could not play:', error)
    })
  }, 150)
}

export function cancelPendingNotificationSound(): void {
  clearTimeout(pendingTimer)
  pendingTimer = undefined
  pendingKind = undefined
}
