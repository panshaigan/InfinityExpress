import { DESKTOP_DOWNLOAD_URL } from '../lib/runtime'

export function DemoBanner() {
  return (
    <aside className="demo-banner" aria-label="Browser demo">
      <strong>Browser demo</strong>
      <span>Pick presets and components, then export your install order. Projects and presets are saved in this browser.</span>
      <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">Download desktop app</a>
    </aside>
  )
}
