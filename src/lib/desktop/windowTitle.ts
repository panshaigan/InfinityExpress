import { getCurrentWindow } from '@tauri-apps/api/window'
import { isDesktopApp } from './fsDialogs'

const APP_TITLE = 'iNfinity eXpress'

/** Window / tab title: app name, or app + open project. */
export function formatAppWindowTitle(projectName: string | null | undefined): string {
  const name = projectName?.trim()
  return name ? `${APP_TITLE} - ${name}` : APP_TITLE
}

/** Sync native Tauri title (and document.title) with the open project. */
export async function setAppWindowTitle(
  projectName: string | null | undefined,
): Promise<void> {
  const title = formatAppWindowTitle(projectName)
  document.title = title
  if (!isDesktopApp()) return
  try {
    await getCurrentWindow().setTitle(title)
  } catch {
    // Browser / missing ACL — document.title still updated.
  }
}
