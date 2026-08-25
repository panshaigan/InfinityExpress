import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isDesktopApp } from './fsDialogs'

export type AppUpdateCheckResult =
  | { status: 'unavailable' }
  | { status: 'current' }
  | { status: 'available'; update: Update; version: string }
  | { status: 'error'; message: string }

function canCheckForUpdates(): boolean {
  return isDesktopApp() && import.meta.env.PROD
}

export async function probeAppUpdate(): Promise<AppUpdateCheckResult> {
  if (!canCheckForUpdates()) return { status: 'unavailable' }
  try {
    const update = await check()
    if (!update) return { status: 'current' }
    return { status: 'available', update, version: update.version }
  } catch (err) {
    return { status: 'error', message: String(err) }
  }
}

export async function installAppUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall()
  await relaunch()
}

export async function checkForAppUpdate(opts?: {
  silent?: boolean
  onAvailable?: (version: string) => void
  onError?: (message: string) => void
}): Promise<AppUpdateCheckResult> {
  const result = await probeAppUpdate()
  if (result.status === 'available') {
    opts?.onAvailable?.(result.version)
  } else if (result.status === 'error' && !opts?.silent) {
    opts?.onError?.(result.message)
  }
  return result
}
