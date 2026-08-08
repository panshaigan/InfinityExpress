import { useEffect, useRef, useState } from 'react'
import {
  readAppDirPaths,
  writeAppDirPaths,
  type AppDirPaths,
} from '../lib/ui/appDirPrefs'
import {
  GITHUB_TOKEN_HELP_URL,
  readGithubToken,
  writeGithubToken,
} from '../lib/ui/githubTokenPrefs'
import {
  readGameFolderPaths,
  writeGameFolderPaths,
  type GameFolderKey,
  type GameFolderPaths,
} from '../lib/ui/gameFolderPrefs'
import { PATHS_CHANGED_EVENT } from '../lib/ui/pathPrefsEvents'
import { GAME_LABELS } from '../lib/xml/schema'
import { DirectoryField } from './DirectoryField'

const GAME_FOLDER_KEYS: GameFolderKey[] = ['bg1', 'bg2', 'iwd', 'pst']

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [folderPaths, setFolderPaths] = useState(readGameFolderPaths)
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [githubToken, setGithubToken] = useState(readGithubToken)

  useEffect(() => {
    if (!open) return
    setFolderPaths(readGameFolderPaths())
    setAppDirs(readAppDirPaths())
    setGithubToken(readGithubToken())
    closeRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    function sync() {
      setFolderPaths(readGameFolderPaths())
      setAppDirs(readAppDirPaths())
    }
    window.addEventListener(PATHS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(PATHS_CHANGED_EVENT, sync)
  }, [open])

  function setFolderPath(key: GameFolderKey, value: string) {
    setFolderPaths((prev) => {
      const next: GameFolderPaths = { ...prev, [key]: value }
      writeGameFolderPaths(next)
      return next
    })
  }

  function setAppDir(key: keyof AppDirPaths, value: string) {
    setAppDirs((prev) => {
      const next: AppDirPaths = { ...prev, [key]: value }
      writeAppDirPaths(next)
      return next
    })
  }

  function onGithubTokenChange(value: string) {
    setGithubToken(value)
    writeGithubToken(value)
  }

  if (!open) return null

  return (
    <div
      className="keyboard-help-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="keyboard-help settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="settings-dialog-title">Settings</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn secondary keyboard-help-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="keyboard-help-lede">
          Paths for unmodded installs, mod downloads, and backups. Changes are
          saved as you edit.
        </p>

        <section className="settings-section">
          <h3 className="engine-folders-title">Unmodded game paths</h3>
          <div className="settings-fields">
            {GAME_FOLDER_KEYS.map((key) => (
              <DirectoryField
                key={key}
                id={`settings-game-folder-${key}`}
                label={GAME_LABELS[key]}
                value={folderPaths[key]}
                onChange={(value) => setFolderPath(key, value)}
                placeholder="Select game folder…"
                browseTitle={`Select ${GAME_LABELS[key]} folder`}
              />
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3 className="engine-folders-title">App directories</h3>
          <div className="settings-fields">
            <DirectoryField
              id="settings-mods-download-dir"
              label="Mods download directory"
              value={appDirs.modsDownloadDir}
              onChange={(value) => setAppDir('modsDownloadDir', value)}
              placeholder="Select download folder…"
              browseTitle="Select mods download folder"
            />
            <DirectoryField
              id="settings-backup-dir"
              label="Backup directory"
              value={appDirs.backupDir}
              onChange={(value) => setAppDir('backupDir', value)}
              placeholder="Select backup folder…"
              browseTitle="Select backup folder"
            />
          </div>
        </section>

        <section className="settings-section">
          <h3 className="engine-folders-title">GitHub</h3>
          <p className="settings-help">
            Optional personal access token raises API rate limits for Check for
            updates on large catalogs. Without a token the app still works via
            public API and HTML scrape fallback. Create a classic token with{' '}
            <code>public_repo</code> (or a fine-grained token with read access to
            public repositories).
          </p>
          <div className="settings-fields">
            <div className="engine-folder-field">
              <label className="engine-folder-label" htmlFor="settings-github-token">
                GitHub token
              </label>
              <input
                id="settings-github-token"
                type="password"
                className="engine-folder-input"
                autoComplete="off"
                spellCheck={false}
                placeholder="ghp_… (optional)"
                value={githubToken}
                onChange={(e) => onGithubTokenChange(e.target.value)}
              />
            </div>
            <p className="settings-help">
              <a href={GITHUB_TOKEN_HELP_URL} target="_blank" rel="noreferrer">
                Open GitHub token page
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
