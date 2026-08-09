import { openUrl } from '@tauri-apps/plugin-opener'
import { isDesktopApp } from './fsDialogs'

/**
 * Open an http(s) URL in the system browser.
 * Use this when the click sits under stopPropagation (table rows, dialogs) —
 * tauri-plugin-opener's window listener never sees those clicks.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim()
  if (!trimmed) return
  if (isDesktopApp()) {
    await openUrl(trimmed)
    return
  }
  window.open(trimmed, '_blank', 'noopener,noreferrer')
}
