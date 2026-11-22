import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from './lib/desktop/fsDialogs'
import { prepareSavedProfile } from './lib/persistence/profileCheckpoint'
import { readProjectIndex } from './lib/projects/projectStore'
import { readSelectionPresetsStore } from './lib/presets/selectionPresetsStore'
import { readUserCatalogStore } from './lib/mods/userCatalog'
import { readAppSession } from './lib/ui/appSessionPrefs'
import { readAppDirPaths } from './lib/ui/appDirPrefs'
import { readVanillaRegistry } from './lib/projects/vanillaRegistry'
import { ProfileRecoveryScreen } from './ui/ProfileRecoveryScreen'
import './index.css'
import {
  applyFreshInstallEnvFlagIfRequested,
  installFreshInstallConsoleApi,
} from './lib/ui/freshInstallReset'
import { usesBundledWeiduPath, writeBundledWeiduPath } from './lib/ui/weiduPrefs'

installFreshInstallConsoleApi()

if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => e.preventDefault())
}

async function seedBundledWeiduPath(): Promise<void> {
  if (!isDesktopApp() || !usesBundledWeiduPath()) return
  try {
    const path = await invoke<string>('bundled_weidu_path')
    if (path.trim()) writeBundledWeiduPath(path)
  } catch {
    /* bundled WeiDU missing in dev build without resources */
  }
}

void applyFreshInstallEnvFlagIfRequested().then(async (wiped) => {
  if (wiped) return
  await prepareSavedProfile()
  // Validate before App's bootstrap migrations or catalog merge can write anything.
  readProjectIndex()
  readSelectionPresetsStore()
  readUserCatalogStore()
  readAppSession()
  readAppDirPaths()
  readVanillaRegistry()
  await seedBundledWeiduPath()
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}).catch((error: unknown) => {
  createRoot(document.getElementById('root')!).render(<ProfileRecoveryScreen error={error} />)
})
