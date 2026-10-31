import { useEffect, useRef, useState } from 'react'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'
import { launchProjectGame, openGameDocuments } from '../../lib/desktop/gameShortcuts'
import { openFolderPath } from '../../lib/desktop/openPath'
import { gameFolderKeyLabel, type GameFolderKey, type GameFolderPaths } from '../../lib/ui/gameFolderPrefs'
import type { SelectedGame } from '../../lib/xml/schema'
import { useBackdropDismiss } from '../backdropDismiss'

interface Props {
  game: SelectedGame | null
  gameFolders: GameFolderPaths
  dataPath: string
  launchBlocked: boolean
  onClose: () => void
}

export function GameShortcutsDialog({ game, gameFolders, dataPath, launchBlocked, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backdrop = useBackdropDismiss(busy ? undefined : onClose)
  const keys: GameFolderKey[] = game === 'eet' ? ['bg1', 'bg2'] : game ? [game] : []
  const desktop = isDesktopApp()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!busy) onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await action() } catch (err) { setError(String(err)) } finally { setBusy(false) }
  }

  return (
    <div className="confirm-dialog-backdrop" role="presentation" {...backdrop}>
      <div className="confirm-dialog game-shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="game-shortcuts-title" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header game-shortcuts-header">
          <h2 id="game-shortcuts-title">Game shortcuts</h2>
          <button ref={closeRef} type="button" className="btn secondary" disabled={busy} onClick={onClose}>Close</button>
        </div>
        {!desktop && <p className="confirm-dialog-message">Available in the desktop app.</p>}
        {keys.map((key) => {
          const path = gameFolders[key].trim()
          const disabled = !desktop || !path || busy
          return (
            <section className="game-shortcuts-section" key={key} aria-label={gameFolderKeyLabel(key)}>
              <h3>{gameFolderKeyLabel(key)}</h3>
              <p className="game-shortcuts-path">{path || 'No game folder configured.'}</p>
              <div className="game-shortcuts-actions">
                <button type="button" className="btn secondary" disabled={disabled} onClick={() => void perform(() => openFolderPath(path))}>Open game folder</button>
                <button type="button" className="btn secondary" disabled={disabled} onClick={() => void perform(() => openGameDocuments(path))}>Open savegame folder</button>
                <button type="button" className="btn" disabled={disabled || launchBlocked} onClick={() => void perform(() => launchProjectGame(path, key))}>Run game</button>
              </div>
            </section>
          )
        })}
        <p className="confirm-dialog-message">Run game uses InfinityLoader when installed, otherwise the normal game executable.</p>
        {launchBlocked && <p className="confirm-dialog-message">Game launch is unavailable while installation or file operations are active.</p>}
        <button type="button" className="btn secondary" disabled={!desktop || !dataPath.trim() || busy} onClick={() => void perform(() => openFolderPath(dataPath))}>Open app data folder</button>
        {error && <p className="install-dialog-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
