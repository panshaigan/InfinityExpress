const STORAGE_KEY = 'infinity-express.notification-sounds'
let enabled = true

export function readNotificationSounds(): boolean {
  try {
    enabled = window.localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    // Retain the in-memory preference when storage is unavailable.
  }
  return enabled
}

export function writeNotificationSounds(value: boolean): void {
  enabled = value
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // The setting still applies for this session.
  }
}
