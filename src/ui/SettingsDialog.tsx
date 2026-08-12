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
import type { GameFolderKey } from '../lib/ui/gameFolderPrefs'
import {
  countMissingByTab,
  focusElementIdForField,
  isPathStillMissing,
  settingsTabForMissing,
  type MissingInstallPath,
  type SettingsFocusField,
} from '../lib/ui/installPathValidation'
import { PATHS_CHANGED_EVENT } from '../lib/ui/pathPrefsEvents'
import { GAME_LABELS } from '../lib/xml/schema'
import { useBackdropDismiss } from './backdropDismiss'
import { DirectoryField } from './DirectoryField'
import { isDesktopApp, pickFile } from '../lib/desktop/fsDialogs'
import { IconTip } from './IconTip'
import { OutlinedTextField } from './OutlinedTextField'
import {
  createManagedVanillaFromFolder,
  readVanillaRegistry,
  registerExternalVanilla,
  syncManagedVanillasFromDisk,
  useExistingManagedVanilla,
  vanillaPath,
  type VanillaRegistry,
} from '../lib/projects'
import type { GameFolderPaths } from '../lib/ui/gameFolderPrefs'
import { emptyDestinations } from '../lib/projects'

const GAME_FOLDER_KEYS: GameFolderKey[] = ['bg1', 'bg2', 'iwd', 'pst']

export type { SettingsFocusField }

type SettingsTab = 'vanilla' | 'app'

interface Props {
  open: boolean
  onClose: () => void
  /** Active project destinations (for missing-path highlight of dest:*). */
  destinations?: GameFolderPaths
  focusField?: SettingsFocusField | null
  highlightMissing?: MissingInstallPath[]
}

const GITHUB_TOKEN_TIP =
  'Optional personal access token raises API rate limits for checking for updates on large catalogs. Without a token the app still works via public API and HTML scrape fallback. Create a classic token with public_repo (or a fine-grained token with read access to public repositories).'

export function SettingsDialog({
  open,
  onClose,
  destinations = emptyDestinations(),
  focusField = null,
  highlightMissing = [],
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)
  const [tab, setTab] = useState<SettingsTab>('vanilla')
  const [registry, setRegistry] = useState<VanillaRegistry>(readVanillaRegistry)
  const [vanillaSource, setVanillaSource] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaErrors, setVanillaErrors] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaBusy, setVanillaBusy] = useState<GameFolderKey | null>(null)
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [githubToken, setGithubToken] = useState(readGithubToken)
  const [weiduPath, setWeiduPath] = useState(readWeiduPath)

  function refreshRegistry() {
    setRegistry(readVanillaRegistry())
  }

  useEffect(() => {
    if (!open) return
    setAppDirs(readAppDirPaths())
    setGithubToken(readGithubToken())
    setWeiduPath(readWeiduPath())
    setVanillaErrors({})
    void syncManagedVanillasFromDisk().then(refreshRegistry)
    refreshRegistry()
    const nextTab: SettingsTab = focusField
      ? settingsTabForMissing(focusField)
      : highlightMissing.length > 0
        ? settingsTabForMissing(highlightMissing[0]!)
        : 'vanilla'
    setTab(nextTab)
    requestAnimationFrame(() => {
      if (focusField) {
        document.getElementById(focusElementIdForField(focusField))?.focus()
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
  }, [open, onClose, focusField, highlightMissing])

  useEffect(() => {
    if (!open) return
    function sync() {
      setAppDirs(readAppDirPaths())
      setWeiduPath(readWeiduPath())
      refreshRegistry()
    }
    window.addEventListener(PATHS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(PATHS_CHANGED_EVENT, sync)
  }, [open])

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

  async function onCreateManaged(key: GameFolderKey) {
    const source = vanillaSource[key]?.trim()
    if (!source) {
      setVanillaErrors((prev) => ({ ...prev, [key]: 'Pick an unmodded folder' }))
      return
    }
    setVanillaBusy(key)
    try {
      await createManagedVanillaFromFolder(key, source)
      setVanillaErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      refreshRegistry()
    } catch (err) {
      setVanillaErrors((prev) => ({ ...prev, [key]: String(err) }))
    } finally {
      setVanillaBusy(null)
    }
  }

  async function onUseExternal(key: GameFolderKey) {
    const source = vanillaSource[key]?.trim()
    if (!source) {
      setVanillaErrors((prev) => ({ ...prev, [key]: 'Pick an unmodded folder' }))
      return
    }
    setVanillaBusy(key)
    try {
      await registerExternalVanilla(key, source)
      setVanillaErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      refreshRegistry()
    } catch (err) {
      setVanillaErrors((prev) => ({ ...prev, [key]: String(err) }))
    } finally {
      setVanillaBusy(null)
    }
  }

  async function onUseExisting(key: GameFolderKey) {
    setVanillaBusy(key)
    try {
      const path = await useExistingManagedVanilla(key)
      if (!path) {
        setVanillaErrors((prev) => ({
          ...prev,
          [key]: 'No managed vanilla found under the backups directory',
        }))
        return
      }
      setVanillaErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      refreshRegistry()
    } catch (err) {
      setVanillaErrors((prev) => ({ ...prev, [key]: String(err) }))
    } finally {
      setVanillaBusy(null)
    }
  }

  const activeMissing = highlightMissing.filter((key) =>
    isPathStillMissing(key, destinations),
  )
  const tabIssueCounts = countMissingByTab(activeMissing)

  function missingFieldError(key: MissingInstallPath): string | null {
    if (!activeMissing.includes(key)) return null
    return 'Required'
  }

  if (!open) return null

  return (
    <div className="keyboard-help-backdrop" role="presentation" {...backdrop}>
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
            id="settings-tab-vanilla"
            aria-selected={tab === 'vanilla'}
            aria-controls="settings-panel-vanilla"
            className={`settings-dialog-tab${tab === 'vanilla' ? ' active' : ''}`}
            onClick={() => setTab('vanilla')}
          >
            Vanilla backups
            {tabIssueCounts.vanilla > 0 ? (
              <span
                className="settings-tab-issue-badge"
                aria-label={`${tabIssueCounts.vanilla} required`}
              >
                {tabIssueCounts.vanilla}
              </span>
            ) : null}
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
            {tabIssueCounts.app > 0 ? (
              <span
                className="settings-tab-issue-badge"
                aria-label={`${tabIssueCounts.app} required`}
              >
                {tabIssueCounts.app}
              </span>
            ) : null}
          </button>
        </div>

        <div className="settings-tab-panels">
          <section
            className={`settings-section settings-tab-panel${tab === 'vanilla' ? ' active' : ''}`}
            id="settings-panel-vanilla"
            role="tabpanel"
            aria-labelledby="settings-tab-vanilla"
            aria-hidden={tab !== 'vanilla'}
          >
            <div className="settings-fields">
              {GAME_FOLDER_KEYS.map((key) => {
                const binding = registry[key]
                const vanillaMissing = missingFieldError(`vanilla:${key}`)
                return (
                  <div key={key} className="settings-vanilla-block">
                    <DirectoryField
                      id={`settings-vanilla-${key}`}
                      label={GAME_LABELS[key]}
                      value={vanillaSource[key] ?? ''}
                      onChange={(value) =>
                        setVanillaSource((prev) => ({ ...prev, [key]: value }))
                      }
                      placeholder="Unmodded folder to copy from or use…"
                      browseTitle={`Select unmodded ${GAME_LABELS[key]}`}
                      hint={
                        binding
                          ? `${binding.mode}: ${vanillaPath(binding)}${
                              binding.version ? ` (v${binding.version})` : ''
                            }`
                          : 'Not set'
                      }
                      error={vanillaErrors[key] ?? vanillaMissing}
                      required={vanillaMissing != null}
                    />
                    <div className="settings-vanilla-actions">
                      <button
                        type="button"
                        className="btn primary has-icon-tip"
                        disabled={vanillaBusy === key}
                        onClick={() => void onCreateManaged(key)}
                      >
                        Create vanilla backup
                        <IconTip>Copies into the backups directory (recommended).</IconTip>
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={vanillaBusy === key}
                        onClick={() => void onUseExternal(key)}
                      >
                        Use folder as vanilla
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={vanillaBusy === key || !appDirs.backupDir.trim()}
                        onClick={() => void onUseExisting(key)}
                      >
                        Use existing managed
                      </button>
                    </div>
                  </div>
                )
              })}
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
                error={missingFieldError('modsDownloadDir')}
                required={activeMissing.includes('modsDownloadDir')}
              />
              <DirectoryField
                id="settings-backup-dir"
                label="Main data folder"
                tip="Stores vanilla backups, install logs, and project data for Infinity Express."
                tipAriaLabel="About main data folder"
                value={appDirs.backupDir}
                onChange={(value) => setAppDir('backupDir', value)}
                placeholder="Select or type the path…"
                browseTitle="Select main data folder"
                error={missingFieldError('backupDir')}
                required={activeMissing.includes('backupDir')}
              />
              <OutlinedTextField
                id="settings-weidu-path"
                label="WeiDU executable"
                value={weiduPath}
                onChange={onWeiduPathChange}
                placeholder="Path to weidu.exe"
                spellCheck={false}
                autoComplete="off"
                error={missingFieldError('weiduPath')}
                required={activeMissing.includes('weiduPath')}
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
