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
  readGameFolderVersions,
  writeGameFolderPaths,
  writeGameFolderVersions,
  type GameFolderKey,
  type GameFolderPaths,
} from '../lib/ui/gameFolderPrefs'
import { PATHS_CHANGED_EVENT } from '../lib/ui/pathPrefsEvents'
import { GAME_LABELS } from '../lib/xml/schema'
import { useBackdropDismiss } from './backdropDismiss'
import { DirectoryField } from './DirectoryField'
import { isDesktopApp, pickFile } from '../lib/desktop/fsDialogs'
import { probeGameFolder } from '../lib/desktop/gameExe'
import { IconTip } from './IconTip'
import { OutlinedTextField } from './OutlinedTextField'

const GAME_FOLDER_KEYS: GameFolderKey[] = ['bg1', 'bg2', 'iwd', 'pst']

type SettingsTab = 'games' | 'app' | 'github'

export type SettingsFocusField = 'modsDownloadDir' | 'weiduPath'

interface Props {
  open: boolean
  onClose: () => void
  /** When set, focus this field instead of the dialog panel on open. */
  focusField?: SettingsFocusField | null
}

const GITHUB_TOKEN_TIP =
  'Optional personal access token raises API rate limits for checking for updates on large catalogs. Without a token the app still works via public API and HTML scrape fallback. Create a classic token with public_repo (or a fine-grained token with read access to public repositories).'

export function SettingsDialog({ open, onClose, focusField = null }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)
  const [tab, setTab] = useState<SettingsTab>('games')
  const [folderPaths, setFolderPaths] = useState(readGameFolderPaths)
  const [folderVersions, setFolderVersions] = useState(readGameFolderVersions)
  const [folderErrors, setFolderErrors] = useState<Partial<Record<GameFolderKey, string>>>(
    {},
  )
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [githubToken, setGithubToken] = useState(readGithubToken)
  const [weiduPath, setWeiduPath] = useState(readWeiduPath)

  useEffect(() => {
    if (!open) return
    setFolderPaths(readGameFolderPaths())
    setFolderVersions(readGameFolderVersions())
    setFolderErrors({})
    setAppDirs(readAppDirPaths())
    setGithubToken(readGithubToken())
    setWeiduPath(readWeiduPath())
    const nextTab: SettingsTab =
      focusField === 'modsDownloadDir' || focusField === 'weiduPath' ? 'app' : 'games'
    setTab(nextTab)
    requestAnimationFrame(() => {
      if (focusField === 'modsDownloadDir') {
        document.getElementById('settings-mods-download-dir')?.focus()
      } else if (focusField === 'weiduPath') {
        document.getElementById('settings-weidu-path')?.focus()
      } else {
        panelRef.current?.focus()
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
      setFolderVersions(readGameFolderVersions())
      setAppDirs(readAppDirPaths())
    }
    window.addEventListener(PATHS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(PATHS_CHANGED_EVENT, sync)
  }, [open])

  function setFolderPath(key: GameFolderKey, value: string) {
    setFolderPaths((prev) => ({ ...prev, [key]: value }))
    if (!value.trim()) {
      setFolderPaths((prev) => {
        const next: GameFolderPaths = { ...prev, [key]: '' }
        writeGameFolderPaths(next)
        return next
      })
      setFolderVersions((prev) => {
        const next = { ...prev, [key]: '' }
        writeGameFolderVersions(next)
        return next
      })
      setFolderErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  function validateFolderPath(key: GameFolderKey, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setFolderPath(key, '')
      return
    }

    void probeGameFolder(key, trimmed).then((result) => {
      if (!result.ok) {
        setFolderErrors((prev) => ({
          ...prev,
          [key]: result.error,
        }))
        setFolderPaths((prev) => ({
          ...prev,
          [key]: readGameFolderPaths()[key],
        }))
        return
      }
      setFolderPaths((prev) => {
        const next: GameFolderPaths = { ...prev, [key]: trimmed }
        writeGameFolderPaths(next)
        return next
      })
      setFolderVersions((prev) => {
        const next = { ...prev, [key]: result.version }
        writeGameFolderVersions(next)
        return next
      })
      setFolderErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
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
      {...backdrop}
    >
      <div
        ref={panelRef}
        className="keyboard-help settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="settings-dialog-title">Settings</h2>
        </div>

        <div className="settings-dialog-tabs" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            role="tab"
            id="settings-tab-games"
            aria-selected={tab === 'games'}
            aria-controls="settings-panel-games"
            className={`settings-dialog-tab${tab === 'games' ? ' active' : ''}`}
            onClick={() => setTab('games')}
          >
            Games
          </button>
          <button
            type="button"
            role="tab"
            id="settings-tab-app"
            aria-selected={tab === 'app'}
            aria-controls="settings-panel-app"
            className={`settings-dialog-tab${tab === 'app' ? ' active' : ''}`}
            onClick={() => setTab('app')}
          >
            App
          </button>
          <button
            type="button"
            role="tab"
            id="settings-tab-github"
            aria-selected={tab === 'github'}
            aria-controls="settings-panel-github"
            className={`settings-dialog-tab${tab === 'github' ? ' active' : ''}`}
            onClick={() => setTab('github')}
          >
            GitHub
          </button>
        </div>

        <div className="settings-tab-panels">
          <section
            className={`settings-section settings-tab-panel${tab === 'games' ? ' active' : ''}`}
            id="settings-panel-games"
            role="tabpanel"
            aria-labelledby="settings-tab-games"
            aria-hidden={tab !== 'games'}
          >
            <div className="settings-fields">
              {GAME_FOLDER_KEYS.map((key) => (
                <DirectoryField
                  key={key}
                  id={`settings-game-folder-${key}`}
                  label={GAME_LABELS[key]}
                  value={folderPaths[key]}
                  onChange={(value) => setFolderPath(key, value)}
                  onValidate={(value) => validateFolderPath(key, value)}
                  placeholder="Path to unmodded game…"
                  browseTitle={`Select ${GAME_LABELS[key]} folder`}
                  hint={folderVersions[key] ? `v${folderVersions[key]}` : null}
                  error={folderErrors[key] ?? null}
                />
              ))}
            </div>
          </section>

          <section
            className={`settings-section settings-tab-panel${tab === 'app' ? ' active' : ''}`}
            id="settings-panel-app"
            role="tabpanel"
            aria-labelledby="settings-tab-app"
            aria-hidden={tab !== 'app'}
          >
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
                label="Backup & logs directory"
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

          <section
            className={`settings-section settings-tab-panel${tab === 'github' ? ' active' : ''}`}
            id="settings-panel-github"
            role="tabpanel"
            aria-labelledby="settings-tab-github"
            aria-hidden={tab !== 'github'}
          >
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
                trailing={
                  <span className="has-icon-tip settings-github-tip-host">
                    <button
                      type="button"
                      className="btn secondary outlined-text-field-action settings-github-tip-btn"
                      aria-label="About GitHub token"
                    >
                      ?
                    </button>
                    <IconTip>{GITHUB_TOKEN_TIP}</IconTip>
                  </span>
                }
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
    </div>
  )
}
