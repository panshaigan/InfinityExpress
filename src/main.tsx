import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import App from './App'
import { isDesktopApp } from './lib/desktop/fsDialogs'
import {
  applyFreshInstallEnvFlagIfRequested,
  installFreshInstallConsoleApi,
} from './lib/ui/freshInstallReset'
import { readWeiduPath, writeWeiduPath } from './lib/ui/weiduPrefs'

installFreshInstallConsoleApi()

if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => e.preventDefault())
}

async function seedBundledWeiduPath(): Promise<void> {
  if (!isDesktopApp() || readWeiduPath().trim()) return
  try {
    const path = await invoke<string>('bundled_weidu_path')
    if (path.trim()) writeWeiduPath(path)
  } catch {
    /* bundled WeiDU missing in dev build without resources */
  }
}

void applyFreshInstallEnvFlagIfRequested().then(async (wiped) => {
  if (wiped) return
  await seedBundledWeiduPath()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
