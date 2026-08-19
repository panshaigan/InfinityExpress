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
  gameFolderKeysForEngine,
  isPathStillMissing,
  resolveSettingsOpenTab,
  type MissingInstallPath,
  type SettingsFocusField,
  type SettingsTab,
} from '../lib/ui/installPathValidation'
import { PATHS_CHANGED_EVENT } from '../lib/ui/pathPrefsEvents'
import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import { useBackdropDismiss } from './backdropDismiss'
import { ConfirmDialog } from './ConfirmDialog'
import { DirectoryField } from './DirectoryField'
import {
  isDesktopApp,
  normalizeFolderPath,
  pickDirectory,
  pickFile,
} from '../lib/desktop/fsDialogs'
import {
  listenBackupProgress,
  type BackupProgress,
} from '../lib/desktop/weiduInstall'
import { HubCardMenu } from './HubCardMenu'
import { IconTip } from './IconTip'
import { OutlinedTextField } from './OutlinedTextField'
import {
  copyVanillaToFolder,
  readVanillaRegistry,
  registerExternalVanilla,
  syncManagedVanillasFromDisk,
  validateDestinationFolder,
  vanillaPath,
  type ProjectId,
  type VanillaBinding,
  type VanillaRegistry,
} from '../lib/projects'
import type { GameFolderPaths } from '../lib/ui/gameFolderPrefs'
import { emptyDestinations } from '../lib/projects'

const GAME_FOLDER_KEYS: GameFolderKey[] = ['bg1', 'bg2', 'iwd', 'pst']

export type { SettingsFocusField, SettingsTab }

interface Props {
  open: boolean
  onClose: () => void
  projectId?: ProjectId | null
  projectEngine?: SelectedGame | null
  /** Active project destinations (for missing-path highlight of dest:*). */
  destinations?: GameFolderPaths
  onDestinationsChange?: (paths: GameFolderPaths) => void
  /** Fires after a destination folder validates (browse / blur). */
  onDestinationsCommitted?: (paths: GameFolderPaths) => void
  /** Default tab when opening without a focused missing field. */
  initialTab?: SettingsTab
  /** Hide destination folders (new-project wizard). */
  hideProjectTab?: boolean
  focusField?: SettingsFocusField | null
  highlightMissing?: MissingInstallPath[]
  onBusyChange?: (busy: boolean) => void
}

const DESTINATION_FOLDER_TIP =
  'Folder where mods will be installed and the game will be modified. An existing install with WeiDU.log is allowed; installed components are imported.'

const MODS_DOWNLOAD_DIR_TIP =
  'Root folder for downloaded mod archives. The Mods phase scans subfolders here.'

const GITHUB_TOKEN_TIP =
  'Optional personal access token raises API rate limits for checking for updates on large catalogs. Without a token the app still works via public API and HTML scrape fallback. Create a classic token with public_repo (or a fine-grained token with read access to public repositories).'

function formatVanillaCopyProgress(
  progress: BackupProgress | null,
  busyKey: GameFolderKey | null,
): { heading: string; detail: string } | null {
  if (!busyKey || !progress?.message?.trim()) return null
  const message = progress.message.trim()
  const phase = progress.phase
  const isPerFileCopy =
    phase === 'copy' &&
    !message.toLowerCase().startsWith('copying') &&
    !message.toLowerCase().startsWith('measuring') &&
    !message.includes('/') &&
    !message.includes('\\')

  return {
    heading: `Copying ${GAME_LABELS[busyKey]} vanilla`,
    detail: isPerFileCopy ? `Copying… ${message}` : message,
  }
}

function vanillaModeLabel(binding: VanillaBinding): string {
  return binding.mode === 'managed' ? 'Managed' : 'External'
}

export function SettingsDialog({
  open,
  onClose,
  projectId = null,
  projectEngine = null,
  destinations = emptyDestinations(),
  onDestinationsChange,
  onDestinationsCommitted,
  initialTab = 'vanilla',
  hideProjectTab = false,
  focusField = null,
  highlightMissing = [],
  onBusyChange,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)
  const [tab, setTab] = useState<SettingsTab>('vanilla')
  const [registry, setRegistry] = useState<VanillaRegistry>(readVanillaRegistry)
  const [vanillaErrors, setVanillaErrors] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaBusy, setVanillaBusy] = useState<GameFolderKey | null>(null)
  const [vanillaProgress, setVanillaProgress] = useState<BackupProgress | null>(null)
  const [menuOpenKey, setMenuOpenKey] = useState<GameFolderKey | null>(null)
  const [pendingCopyKey, setPendingCopyKey] = useState<GameFolderKey | null>(null)
  const menuOpenKeyRef = useRef<GameFolderKey | null>(null)
  const pendingCopyKeyRef = useRef<GameFolderKey | null>(null)
  const [destErrors, setDestErrors] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [githubToken, setGithubToken] = useState(readGithubToken)
  const [weiduPath, setWeiduPath] = useState(readWeiduPath)

  menuOpenKeyRef.current = menuOpenKey
  pendingCopyKeyRef.current = pendingCopyKey

  useEffect(() => {
    onBusyChange?.(vanillaBusy !== null)
    return () => onBusyChange?.(false)
  }, [vanillaBusy, onBusyChange])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listenBackupProgress((payload) => {
      if (!cancelled) setVanillaProgress(payload)
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [open])

  function refreshRegistry() {
    setRegistry(readVanillaRegistry())
  }

  useEffect(() => {
    if (!open) return
    setAppDirs(readAppDirPaths())
    setGithubToken(readGithubToken())
    setWeiduPath(readWeiduPath())
    setVanillaErrors({})
    setDestErrors({})
    setMenuOpenKey(null)
    setPendingCopyKey(null)
    setVanillaProgress(null)
    void syncManagedVanillasFromDisk().then(refreshRegistry)
    refreshRegistry()
    setTab(
      resolveSettingsOpenTab({
        focusField,
        highlightMissing,
        initialTab,
        hideProjectTab,
      }),
    )
    requestAnimationFrame(() => {
      if (focusField) {
        document.getElementById(focusElementIdForField(focusField))?.focus()
      } else {
        panelRef.current?.focus()
      }
    })
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (menuOpenKeyRef.current != null || pendingCopyKeyRef.current != null) return
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, focusField, highlightMissing, initialTab, hideProjectTab])

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

  function setVanillaFieldError(key: GameFolderKey, message: string | null) {
    setVanillaErrors((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  function setDestFieldError(key: GameFolderKey, message: string | null) {
    setDestErrors((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  function distinctPathError(
    _selfLabel: string,
    selfPath: string,
    others: { label: string; path: string }[],
  ): string | null {
    const selfNorm = normalizeFolderPath(selfPath)
    if (!selfNorm) return null
    for (const other of others) {
      const otherNorm = normalizeFolderPath(other.path)
      if (!otherNorm) continue
      if (selfNorm === otherNorm) {
        return `Must be a different folder from ${other.label}`
      }
    }
    return null
  }

  function destinationDistinctOthers(
    exclude: GameFolderKey,
    destKeys: GameFolderKey[],
  ): { label: string; path: string }[] {
    const others: { label: string; path: string }[] = [
      { label: 'Main data folder', path: appDirs.backupDir },
      { label: 'Mods download directory', path: appDirs.modsDownloadDir },
    ]
    const reg = readVanillaRegistry()
    for (const key of GAME_FOLDER_KEYS) {
      const vPath = vanillaPath(reg[key])
      if (vPath) {
        others.push({
          label: `${GAME_LABELS[key]} vanilla`,
          path: vPath,
        })
      }
    }
    for (const key of destKeys) {
      if (key === exclude) continue
      others.push({
        label: `${GAME_LABELS[key]} destination`,
        path: destinations[key] ?? '',
      })
    }
    return others
  }

  function vanillaDistinctOthers(exclude: GameFolderKey): { label: string; path: string }[] {
    const others: { label: string; path: string }[] = [
      { label: 'Main data folder', path: appDirs.backupDir },
      { label: 'Mods download directory', path: appDirs.modsDownloadDir },
    ]
    const reg = readVanillaRegistry()
    for (const key of GAME_FOLDER_KEYS) {
      if (key === exclude) continue
      const vPath = vanillaPath(reg[key])
      if (vPath) {
        others.push({
          label: `${GAME_LABELS[key]} vanilla`,
          path: vPath,
        })
      }
    }
    for (const key of GAME_FOLDER_KEYS) {
      const dest = destinations[key]?.trim()
      if (dest) {
        others.push({
          label: `${GAME_LABELS[key]} destination`,
          path: dest,
        })
      }
    }
    return others
  }

  async function validateDestDir(key: GameFolderKey, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setDestFieldError(key, 'Required')
      return
    }
    try {
      await validateDestinationFolder(key, trimmed)
    } catch (err) {
      setDestFieldError(key, String(err))
      return
    }
    const destKeys = projectEngine ? gameFolderKeysForEngine(projectEngine) : []
    const clash = distinctPathError(
      `${GAME_LABELS[key]} destination`,
      trimmed,
      destinationDistinctOthers(key, destKeys),
    )
    setDestFieldError(key, clash)
    if (!clash) {
      onDestinationsCommitted?.({ ...destinations, [key]: trimmed })
    }
  }

  function onDestChange(key: GameFolderKey, value: string) {
    if (!onDestinationsChange) return
    onDestinationsChange({ ...destinations, [key]: value })
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

  async function onChooseOtherFolder(key: GameFolderKey) {
    setMenuOpenKey(null)
    if (!isDesktopApp()) {
      setVanillaFieldError(key, 'Available in the desktop app')
      return
    }
    const picked = await pickDirectory(`Select unmodded ${GAME_LABELS[key]}`)
    if (!picked) return
    const clash = distinctPathError(
      `${GAME_LABELS[key]} vanilla`,
      picked,
      vanillaDistinctOthers(key),
    )
    if (clash) {
      setVanillaFieldError(key, clash)
      return
    }
    setVanillaBusy(key)
    setVanillaProgress(null)
    try {
      await registerExternalVanilla(key, picked)
      setVanillaFieldError(key, null)
      refreshRegistry()
    } catch (err) {
      setVanillaFieldError(key, String(err))
    } finally {
      setVanillaBusy(null)
      setVanillaProgress(null)
    }
  }

  async function runCopyElsewhere(key: GameFolderKey) {
    setPendingCopyKey(null)
    if (!isDesktopApp()) {
      setVanillaFieldError(key, 'Available in the desktop app')
      return
    }
    const picked = await pickDirectory(`Copy ${GAME_LABELS[key]} vanilla to…`)
    if (!picked) return
    const clash = distinctPathError(
      `${GAME_LABELS[key]} vanilla`,
      picked,
      vanillaDistinctOthers(key),
    )
    if (clash) {
      setVanillaFieldError(key, clash)
      return
    }
    setVanillaBusy(key)
    setVanillaProgress(null)
    try {
      await copyVanillaToFolder(key, picked)
      setVanillaFieldError(key, null)
      refreshRegistry()
    } catch (err) {
      setVanillaFieldError(key, String(err))
    } finally {
      setVanillaBusy(null)
      setVanillaProgress(null)
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

  const destKeys =
    projectEngine != null ? gameFolderKeysForEngine(projectEngine) : []
  const showProjectFields = projectId != null && projectEngine != null
  const setVanillaKeys = GAME_FOLDER_KEYS.filter((key) => registry[key] != null)
  const copyProgress = formatVanillaCopyProgress(vanillaProgress, vanillaBusy)
  const pendingCopyLabel =
    pendingCopyKey != null ? GAME_LABELS[pendingCopyKey] : ''

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
          {hideProjectTab ? null : (
            <button
              type="button"
              role="tab"
              id="settings-tab-project"
              aria-selected={tab === 'project'}
              aria-controls="settings-panel-project"
              className={`settings-dialog-tab${tab === 'project' ? ' active' : ''}`}
              onClick={() => setTab('project')}
            >
              Project
              {tabIssueCounts.project > 0 ? (
                <span
                  className="settings-tab-issue-badge"
                  aria-label={`${tabIssueCounts.project} required`}
                >
                  {tabIssueCounts.project}
                </span>
              ) : null}
            </button>
          )}
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
          {hideProjectTab ? null : (
            <section
              className={`settings-section settings-tab-panel${tab === 'project' ? ' active' : ''}`}
              id="settings-panel-project"
              role="tabpanel"
              aria-labelledby="settings-tab-project"
              aria-hidden={tab !== 'project'}
            >
              {showProjectFields ? (
                <div className="settings-fields">
                  {destKeys.map((key) => {
                    const destMissing = missingFieldError(`dest:${key}`)
                    return (
                      <DirectoryField
                        key={key}
                        id={`settings-dest-${key}`}
                        label={`Modded ${GAME_LABELS[key]} destination`}
                        tip={DESTINATION_FOLDER_TIP}
                        tipAriaLabel="About destination folder"
                        value={destinations[key]}
                        onChange={(value) => {
                          onDestChange(key, value)
                          setDestFieldError(key, null)
                        }}
                        onValidate={(value) => void validateDestDir(key, value)}
                        placeholder="Select or type the path…"
                        browseTitle={`Select ${GAME_LABELS[key]} destination`}
                        error={destErrors[key] ?? destMissing}
                        required={destMissing != null}
                      />
                    )
                  })}
                </div>
              ) : (
                <p className="settings-help">Open a project to edit destination folders.</p>
              )}
            </section>
          )}

          <section
            className={`settings-section settings-tab-panel${tab === 'vanilla' ? ' active' : ''}`}
            id="settings-panel-vanilla"
            role="tabpanel"
            aria-labelledby="settings-tab-vanilla"
            aria-hidden={tab !== 'vanilla'}
          >
            {setVanillaKeys.length === 0 ? (
              <p className="settings-help">
                No vanilla backups yet. Create them when starting a new project.
              </p>
            ) : (
              <ul className="settings-vanilla-list">
                {setVanillaKeys.map((key) => {
                  const binding = registry[key]!
                  const path = vanillaPath(binding) ?? ''
                  const vanillaMissing = missingFieldError(`vanilla:${key}`)
                  const error = vanillaErrors[key] ?? vanillaMissing
                  const busy = vanillaBusy === key
                  return (
                    <li
                      key={key}
                      id={`settings-vanilla-${key}`}
                      className={`settings-vanilla-card${error ? ' has-error' : ''}${
                        busy ? ' is-busy' : ''
                      }`}
                      tabIndex={-1}
                    >
                      <div className="settings-vanilla-card-main">
                        <span className="settings-vanilla-card-name">
                          {GAME_LABELS[key]}
                        </span>
                        <span className="settings-vanilla-card-meta">
                          <span className="settings-vanilla-card-badge">
                            {vanillaModeLabel(binding)}
                          </span>
                          {binding.version ? (
                            <>
                              <span className="settings-vanilla-card-sep">·</span>
                              <span>v{binding.version}</span>
                            </>
                          ) : null}
                          {path ? (
                            <>
                              <span className="settings-vanilla-card-sep">·</span>
                              <span className="settings-vanilla-card-path">
                                {path}
                              </span>
                            </>
                          ) : null}
                        </span>
                        {error ? (
                          <span className="settings-vanilla-card-error" role="alert">
                            {error}
                          </span>
                        ) : null}
                        {busy && copyProgress ? (
                          <span className="settings-vanilla-card-progress" role="status">
                            <span className="settings-vanilla-card-progress-heading">
                              {copyProgress.heading}
                            </span>
                            <span className="settings-vanilla-card-progress-detail">
                              {copyProgress.detail}
                            </span>
                          </span>
                        ) : busy ? (
                          <span className="settings-vanilla-card-progress" role="status">
                            Working…
                          </span>
                        ) : null}
                      </div>
                      <HubCardMenu
                        open={menuOpenKey === key}
                        onOpenChange={(nextOpen) =>
                          setMenuOpenKey(nextOpen ? key : null)
                        }
                        label={`${GAME_LABELS[key]} vanilla`}
                        className="settings-vanilla-card-menu"
                        items={[
                          {
                            id: 'choose-other',
                            label: 'Choose other folder…',
                            disabled: busy || !isDesktopApp(),
                            onSelect: () => void onChooseOtherFolder(key),
                          },
                          {
                            id: 'copy-elsewhere',
                            label: 'Copy to new location…',
                            disabled: busy || !isDesktopApp(),
                            onSelect: () => {
                              setMenuOpenKey(null)
                              setPendingCopyKey(key)
                            },
                          },
                        ]}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
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
                tip={MODS_DOWNLOAD_DIR_TIP}
                tipAriaLabel="About mods download directory"
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
                tip="Stores vanilla backups, install logs, and project data for iNfinity eXpress."
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
                  <span className="has-icon-tip field-help-tip-host">
                    <button
                      type="button"
                      className="field-help-tip"
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

      <ConfirmDialog
        open={pendingCopyKey != null}
        title="Copy vanilla backup?"
        message={
          pendingCopyKey
            ? `Copy the ${pendingCopyLabel} vanilla to another folder and use that as the backup? The current binding will switch; the old folder is not deleted.`
            : ''
        }
        confirmLabel="Choose folder…"
        onCancel={() => setPendingCopyKey(null)}
        onConfirm={() => {
          if (pendingCopyKey) void runCopyElsewhere(pendingCopyKey)
        }}
      />
    </div>
  )
}
