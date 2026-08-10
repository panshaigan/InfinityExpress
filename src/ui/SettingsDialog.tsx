import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { openExternalUrl } from '../lib/desktop/openExternalUrl'
import {
  readAppDirPaths,
  writeAppDirPaths,
  type AppDirPaths,
} from '../lib/ui/appDirPrefs'
import { readWeiduPath, writeWeiduPath } from '../lib/ui/weiduPrefs'
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
import { isDesktopApp, pickFile } from '../lib/desktop/fsDialogs'
import { OutlinedTextField } from './OutlinedTextField'

const GAME_FOLDER_KEYS: GameFolderKey[] = ['bg1', 'bg2', 'iwd', 'pst']

export type SettingsFocusField = 'modsDownloadDir' | 'weiduPath'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, focus this field instead of Close on open. */
  focusField?: SettingsFocusField | null
}

export function SettingsDialog({ open, onClose, focusField = null }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [folderPaths, setFolderPaths] = useState(readGameFolderPaths)
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [githubToken, setGithubToken] = useState(readGithubToken)
  const [weiduPath, setWeiduPath] = useState(readWeiduPath)

  useEffect(() => {
    if (!open) return
    setFolderPaths(readGameFolderPaths())
    setAppDirs(readAppDirPaths())
    setGithubToken(readGithubToken())
    setWeiduPath(readWeiduPath())
    requestAnimationFrame(() => {
      if (focusField === 'modsDownloadDir') {
        document.getElementById('settings-mods-download-dir')?.focus()
      } else if (focusField === 'weiduPath') {
        document.getElementById('settings-weidu-path')?.focus()
      } else {
        closeRef.current?.focus()
      }
    })
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, focusField])

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

  function onWeiduPathChange(value: string) {
    setWeiduPath(value)
    writeWeiduPath(value)
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
            <OutlinedTextField
              id="settings-weidu-path"
              label="WeiDU executable"
              value={weiduPath}
              onChange={onWeiduPathChange}
              placeholder="Path to weidu.exe"
              spellCheck={false}
              autoComplete="off"
              trailing={
                <button
                  type="button"
                  className="btn secondary outlined-text-field-action"
                  disabled={!isDesktopApp()}
                  onClick={() => {
                    void pickFile('Select WeiDU executable').then((path) => {
                      if (path) onWeiduPathChange(path)
                    })
                  }}
                >
                  Browse
                </button>
              }
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
            <OutlinedTextField
              id="settings-github-token"
              label="GitHub token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ghp_… (optional)"
              value={githubToken}
              onChange={onGithubTokenChange}
            />
            <p className="settings-help">
              <a
                href={GITHUB_TOKEN_HELP_URL}
                target="_blank"
                rel="noreferrer"
                onClick={(e: ReactMouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void openExternalUrl(GITHUB_TOKEN_HELP_URL)
                }}
              >
                Open GitHub token page
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
