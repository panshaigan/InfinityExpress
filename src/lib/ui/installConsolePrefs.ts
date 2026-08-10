const STORAGE_KEY = 'infinity-express.install-console-height'
const DEFAULT = 200

export function readInstallConsoleHeight(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT
    return Math.min(480, Math.max(120, Math.round(n)))
  } catch {
    return DEFAULT
  }
}

export function writeInstallConsoleHeight(height: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(height))
  } catch {
    /* ignore */
  }
}
