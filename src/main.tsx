import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import {
  applyFreshInstallEnvFlagIfRequested,
  installFreshInstallConsoleApi,
} from './lib/ui/freshInstallReset'

installFreshInstallConsoleApi()

void applyFreshInstallEnvFlagIfRequested().then((wiped) => {
  if (wiped) return
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
