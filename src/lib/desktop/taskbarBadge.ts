import { getCurrentWindow } from '@tauri-apps/api/window'
import badgeUrl from '../../assets/taskbar-notification.png'
import { isDesktopApp } from './fsDialogs'

export function getTaskbarWindow() {
  if (isDesktopApp() && /Windows/.test(navigator.userAgent)) return getCurrentWindow()
  return undefined
}

let overlayUpdate = Promise.resolve()

export function setTaskbarBadge(visible: boolean): void {
  const appWindow = getTaskbarWindow()
  if (!appWindow) return

  // Apply updates in order even when a focus change arrives during an icon load.
  overlayUpdate = overlayUpdate.then(async () => {
    if (!visible) return appWindow.setOverlayIcon()
    const image = await fetch(badgeUrl)
    if (!image.ok) throw new Error('Could not load the taskbar badge icon.')
    await appWindow.setOverlayIcon(await image.arrayBuffer())
  }).catch((error: unknown) => {
    console.warn('Could not update the taskbar badge:', error)
  })
}
