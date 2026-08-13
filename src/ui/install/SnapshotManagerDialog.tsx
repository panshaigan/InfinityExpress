import { useEffect, useMemo, useState } from 'react'
import type { BackupEntry, BackupManifest } from '../../lib/install/types'
import {
  backupGameDir,
  createNamedBackup,
  deleteBackup,
  listBackups,
  listenBackupProgress,
  restoreGameDir,
  type BackupProgress,
} from '../../lib/desktop/weiduInstall'
import { useBackdropDismiss } from '../backdropDismiss'
import { ConfirmDialog } from '../ConfirmDialog'
import { IconTip } from '../IconTip'
import { OutlinedTextField } from '../OutlinedTextField'
import { DeleteFromCatalogIcon } from '../mods/ModsActionIcons'
import { useToast } from '../toasts/toastContext'
import { defaultSnapshotName } from '../../lib/install/snapshotName'

export type SnapshotDialogMode = 'vanilla' | 'manage'

type ManageTab = 'create' | 'restore'

interface ListedSnapshot extends BackupEntry {
  gameKey: string
}

interface Props {
  open: boolean
  mode: SnapshotDialogMode
  /** Initial tab when mode is manage. */
  initialManageTab?: ManageTab
  backupRoot: string
  /** Keys to list / operate on (EET: bg1+bg2). */
  gameKeys: string[]
  /** Game folder paths keyed by game key. */
  dirsByKey: Record<string, string>
  /**
   * Primary key for vanilla-gate dialogs and non-EET create.
   * For EET manage, first missing vanilla is preferred when creating vanilla.
   */
  gameKey: string
  sourceDir: string
  targetDir: string
  /** When true, snapshot create shows BG1/BG2 include checkboxes. */
  eetMode?: boolean
  onClose: () => void
  onVanillaDone: () => void
  onRestoreDone: (snapshotPath: string, restoredGameKey: string) => void
  onBusyChange?: (busy: boolean) => void
  /** Optional install Commands-tab log (timestamped by caller). */
  onLog?: (message: string) => void
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function emptyProgress(message: string): BackupProgress {
  return {
    phase: 'start',
    message,
    filesDone: 0,
    bytesDone: 0,
    filesTotal: 0,
    bytesTotal: 0,
  }
}

function parseCreatedAt(raw: string): Date | null {
  const iso = Date.parse(raw)
  if (!Number.isNaN(iso)) return new Date(iso)
  const legacy = /^backup-(\d+)$/.exec(raw)
  if (legacy) {
    const secs = Number(legacy[1])
    if (Number.isFinite(secs)) return new Date(secs * 1000)
  }
  return null
}

function formatCreatedAt(raw: string): string {
  const d = parseCreatedAt(raw)
  if (!d) return raw
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function typeLabel(entry: BackupEntry): string {
  return entry.excludeSafeDirs ? 'Snapshot (partial)' : 'Snapshot (full)'
}

function gameKeyLabel(key: string): string {
  if (key === 'bg1') return 'BG1'
  if (key === 'bg2') return 'BG2'
  return key.toUpperCase()
}

export function SnapshotManagerDialog({
  open,
  mode,
  initialManageTab = 'create',
  backupRoot,
  gameKeys,
  dirsByKey,
  gameKey,
  sourceDir,
  targetDir,
  eetMode = false,
  onClose,
  onVanillaDone,
  onRestoreDone,
  onBusyChange,
  onLog,
}: Props) {
  const { pushToast } = useToast()
  const [manageTab, setManageTab] = useState<ManageTab>(initialManageTab)
  const [excludeSafeDirs, setExcludeSafeDirs] = useState(false)
  const [snapshotName, setSnapshotName] = useState(defaultSnapshotName)
  const [manifests, setManifests] = useState<Record<string, BackupManifest>>({})
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [selectedGameKey, setSelectedGameKey] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ListedSnapshot | null>(null)
  const [includeBg1, setIncludeBg1] = useState(true)
  const [includeBg2, setIncludeBg2] = useState(true)
  const [vanillaTargetKey, setVanillaTargetKey] = useState(gameKey)
  const backdrop = useBackdropDismiss(
    busy || pendingDelete != null ? undefined : onClose,
  )

  const keys = useMemo(
    () => (gameKeys.length > 0 ? gameKeys : [gameKey]),
    [gameKeys, gameKey],
  )

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  async function loadManifests(): Promise<Record<string, BackupManifest>> {
    const next: Record<string, BackupManifest> = {}
    await Promise.all(
      keys.map(async (key) => {
        try {
          next[key] = await listBackups(backupRoot, key)
        } catch {
          next[key] = { gameKey: key, vanilla: null, snapshots: [] }
        }
      }),
    )
    setManifests(next)
    return next
  }

  useEffect(() => {
    if (!open) return
    void loadManifests()
  }, [open, backupRoot, keys.join('|')])

  useEffect(() => {
    if (!open) return
    setError(null)
    setProgress(null)
    setPendingDelete(null)
    setManageTab(initialManageTab)
    setSelectedPath('')
    setSelectedGameKey('')
    if (mode === 'manage') setSnapshotName(defaultSnapshotName())
    setVanillaTargetKey(gameKey)
    setIncludeBg1(Boolean(dirsByKey.bg1?.trim()))
    setIncludeBg2(Boolean(dirsByKey.bg2?.trim()))
  }, [open, mode, initialManageTab, gameKey])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (busy) return
      if (pendingDelete) {
        setPendingDelete(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, pendingDelete, onClose])

  useEffect(() => {
    if (!open || !busy) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listenBackupProgress((payload) => {
      if (!cancelled) setProgress(payload)
    }).then((fn) => {
      if (cancelled) {
        fn()
        return
      }
      unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [open, busy])

  const missingVanillaKeys = useMemo(
    () => keys.filter((k) => !manifests[k]?.vanilla),
    [keys, manifests],
  )
  const manifestsLoaded = keys.every((k) =>
    Object.prototype.hasOwnProperty.call(manifests, k),
  )
  const forceVanillaOnly =
    mode === 'vanilla' ||
    (mode === 'manage' &&
      manageTab === 'create' &&
      (!manifestsLoaded || missingVanillaKeys.length > 0))

  useEffect(() => {
    if (!forceVanillaOnly) return
    const preferred =
      missingVanillaKeys.find((k) => k === gameKey) ??
      missingVanillaKeys[0] ??
      gameKey
    setVanillaTargetKey(preferred)
  }, [forceVanillaOnly, missingVanillaKeys.join('|'), gameKey])

  if (!open) return null

  const vanillaDir =
    dirsByKey[vanillaTargetKey]?.trim() ||
    (vanillaTargetKey === gameKey ? sourceDir : '') ||
    ''

  const entries: ListedSnapshot[] = keys.flatMap((key) =>
    (manifests[key]?.snapshots ?? []).map((s) => ({ ...s, gameKey: key })),
  )

  const progressPct =
    progress && progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesDone / progress.bytesTotal) * 100))
      : null

  const progressBytes =
    progress && progress.bytesTotal > 0
      ? `${formatBytes(progress.bytesDone)} / ${formatBytes(progress.bytesTotal)}`
      : progress && progress.filesDone > 0
        ? `${progress.filesDone} files · ${formatBytes(progress.bytesDone)}`
        : null

  const progressAria =
    progress && progressBytes
      ? `${progress.message} ${progressBytes}`
      : progress?.message ?? undefined

  async function runVanilla() {
    if (!vanillaDir) {
      setError(`Set ${gameKeyLabel(vanillaTargetKey)} game folder in Settings.`)
      return
    }
    setBusy(true)
    setError(null)
    setProgress(emptyProgress('Starting vanilla backup…'))
    try {
      await backupGameDir({
        sourceDir: vanillaDir,
        backupRoot,
        gameKey: vanillaTargetKey,
        kind: 'vanilla',
        excludeSafeDirs,
      })
      onLog?.(`Vanilla backup created (${vanillaTargetKey})`)
      pushToast({ tone: 'success', message: 'Vanilla backup created.' })
      await loadManifests()
      if (mode === 'vanilla') {
        onVanillaDone()
        onClose()
      }
    } catch (e) {
      const message = String(e)
      setError(message)
      onLog?.(`Vanilla backup failed: ${message}`)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function runSnapshot() {
    const name = snapshotName.trim() || defaultSnapshotName()
    const targets: { key: string; dir: string }[] = []
    if (eetMode) {
      if (includeBg1) {
        const dir = dirsByKey.bg1?.trim()
        if (!dir) {
          setError('Set BG1 game folder in Settings.')
          return
        }
        if (!manifests.bg1?.vanilla) {
          setError('Create a BG1 vanilla backup before snapshots.')
          return
        }
        targets.push({ key: 'bg1', dir })
      }
      if (includeBg2) {
        const dir = dirsByKey.bg2?.trim()
        if (!dir) {
          setError('Set BG2 game folder in Settings.')
          return
        }
        if (!manifests.bg2?.vanilla) {
          setError('Create a BG2 vanilla backup before snapshots.')
          return
        }
        targets.push({ key: 'bg2', dir })
      }
      if (targets.length === 0) {
        setError('Select at least one game to include in the snapshot.')
        return
      }
    } else {
      const dir = dirsByKey[gameKey]?.trim() || sourceDir
      if (!dir) {
        setError('Game folder is not set.')
        return
      }
      targets.push({ key: gameKey, dir })
    }

    setBusy(true)
    setError(null)
    setProgress(emptyProgress('Starting snapshot…'))
    try {
      for (const t of targets) {
        setProgress(emptyProgress(`Snapshot ${gameKeyLabel(t.key)}…`))
        await createNamedBackup({
          sourceDir: t.dir,
          backupRoot,
          gameKey: t.key,
          kind: 'snapshot',
          name,
          excludeSafeDirs,
        })
        onLog?.(`Snapshot "${name}" saved (${t.key})`)
      }
      pushToast({
        tone: 'success',
        message:
          targets.length > 1
            ? `Snapshot saved for ${targets.map((t) => gameKeyLabel(t.key)).join(' + ')}.`
            : 'Snapshot saved.',
      })
      onClose()
    } catch (e) {
      const message = String(e)
      setError(message)
      onLog?.(`Snapshot failed: ${message}`)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function runRestore() {
    if (!selectedPath || !selectedGameKey) return
    const dest = dirsByKey[selectedGameKey]?.trim() || targetDir
    if (!dest) {
      setError(`Set ${gameKeyLabel(selectedGameKey)} game folder in Settings.`)
      return
    }
    setBusy(true)
    setError(null)
    setProgress(emptyProgress('Cleaning game folder…'))
    try {
      await restoreGameDir(selectedPath, dest)
      onLog?.(`Snapshot restored from ${selectedPath} → ${selectedGameKey}`)
      pushToast({ tone: 'success', message: 'Snapshot restored.' })
      onRestoreDone(selectedPath, selectedGameKey)
      onClose()
    } catch (e) {
      const message = String(e)
      setError(message)
      onLog?.(`Snapshot restore failed: ${message}`)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const entry = pendingDelete
    setPendingDelete(null)
    setBusy(true)
    setError(null)
    setProgress(emptyProgress('Removing snapshot…'))
    try {
      await deleteBackup(backupRoot, entry.gameKey, entry.path)
      if (selectedPath === entry.path) {
        setSelectedPath('')
        setSelectedGameKey('')
      }
      await loadManifests()
      onLog?.(`Snapshot deleted: ${entry.name} (${entry.gameKey})`)
      pushToast({ tone: 'success', message: 'Snapshot deleted.' })
    } catch (e) {
      const message = String(e)
      setError(message)
      onLog?.(`Snapshot delete failed: ${message}`)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const showCreateForm =
    mode === 'vanilla' || (mode === 'manage' && manageTab === 'create')
  const showMultiVanillaPick =
    forceVanillaOnly && manifestsLoaded && missingVanillaKeys.length > 1

  return (
    <div className="keyboard-help-backdrop" role="presentation" {...backdrop}>
      <div
        className="keyboard-help settings-dialog backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snapshot-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="snapshot-dialog-title">
            {mode === 'vanilla' || forceVanillaOnly ? 'Vanilla backup' : 'Snapshots'}
          </h2>
        </div>

        {mode === 'manage' ? (
          <div className="settings-dialog-tabs" role="tablist" aria-label="Snapshot actions">
            <button
              type="button"
              role="tab"
              aria-selected={manageTab === 'create'}
              className={`settings-dialog-tab${manageTab === 'create' ? ' active' : ''}`}
              onClick={() => setManageTab('create')}
              disabled={busy}
            >
              Create
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={manageTab === 'restore'}
              className={`settings-dialog-tab${manageTab === 'restore' ? ' active' : ''}`}
              onClick={() => setManageTab('restore')}
              disabled={busy}
            >
              Restore
            </button>
          </div>
        ) : null}

        <div className="backup-dialog-body">
          {showCreateForm ? (
            <div className="settings-fields">
              {forceVanillaOnly ? (
                <>
                  {showMultiVanillaPick ? (
                    <fieldset className="backup-include-fieldset">
                      <legend>Create vanilla for</legend>
                      {missingVanillaKeys.map((key) => (
                        <label key={key} className="install-filter-toggle">
                          <input
                            type="radio"
                            name="vanilla-target"
                            checked={vanillaTargetKey === key}
                            onChange={() => setVanillaTargetKey(key)}
                            disabled={busy}
                          />
                          <span>{gameKeyLabel(key)}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="backup-restore-empty">
                      Create a vanilla backup for {gameKeyLabel(vanillaTargetKey)} before
                      snapshots.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <OutlinedTextField
                    label="Name"
                    value={snapshotName}
                    onChange={setSnapshotName}
                    disabled={busy}
                  />
                  {eetMode ? (
                    <fieldset className="backup-include-fieldset">
                      <legend>Include in snapshot</legend>
                      <label className="install-filter-toggle">
                        <input
                          type="checkbox"
                          checked={includeBg1}
                          onChange={(e) => setIncludeBg1(e.target.checked)}
                          disabled={busy || !dirsByKey.bg1?.trim()}
                        />
                        <span>BG1</span>
                      </label>
                      <label className="install-filter-toggle">
                        <input
                          type="checkbox"
                          checked={includeBg2}
                          onChange={(e) => setIncludeBg2(e.target.checked)}
                          disabled={busy || !dirsByKey.bg2?.trim()}
                        />
                        <span>BG2</span>
                      </label>
                    </fieldset>
                  ) : null}
                </>
              )}
              <label className="install-filter-toggle">
                <input
                  type="checkbox"
                  checked={excludeSafeDirs}
                  onChange={(e) => setExcludeSafeDirs(e.target.checked)}
                  disabled={busy}
                />
                <span>Exclude movies and music</span>
              </label>
            </div>
          ) : (
            <div className="backup-restore-list ie-scroll">
              {entries.length === 0 ? (
                <p className="backup-restore-empty">No snapshots found for this game folder.</p>
              ) : (
                <table className="backup-restore-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      {keys.length > 1 ? <th scope="col">Game</th> : null}
                      <th scope="col">Type</th>
                      <th scope="col">Created</th>
                      <th scope="col">
                        <span className="visually-hidden">Delete</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const selected = selectedPath === entry.path
                      return (
                        <tr
                          key={`${entry.gameKey}:${entry.path}`}
                          className={selected ? 'selected' : undefined}
                          onClick={() => {
                            if (!busy) {
                              setSelectedPath(entry.path)
                              setSelectedGameKey(entry.gameKey)
                            }
                          }}
                        >
                          <td>
                            <label className="backup-restore-name">
                              <input
                                type="radio"
                                name="snapshot-choice"
                                checked={selected}
                                onChange={() => {
                                  setSelectedPath(entry.path)
                                  setSelectedGameKey(entry.gameKey)
                                }}
                                disabled={busy}
                              />
                              <span>{entry.name}</span>
                            </label>
                          </td>
                          {keys.length > 1 ? (
                            <td>{gameKeyLabel(entry.gameKey)}</td>
                          ) : null}
                          <td>{typeLabel(entry)}</td>
                          <td>{formatCreatedAt(entry.createdAt)}</td>
                          <td className="backup-restore-actions">
                            <button
                              type="button"
                              className="btn secondary install-control-btn has-icon-tip"
                              disabled={busy}
                              aria-label={`Delete ${entry.name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setPendingDelete(entry)
                              }}
                            >
                              <DeleteFromCatalogIcon />
                              <IconTip>Delete</IconTip>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="install-dialog-progress-block" aria-hidden={!progress}>
          {progress ? (
            <>
              <div
                className="backup-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct ?? undefined}
                aria-valuetext={progressAria}
              >
                <div
                  className={`backup-progress-fill${progressPct == null ? ' indeterminate' : ''}`}
                  style={progressPct != null ? { width: `${progressPct}%` } : undefined}
                />
              </div>
              <div className="backup-progress-meta">
                <p className="install-dialog-progress backup-progress-message">
                  {progress.message}
                </p>
                {progressBytes ? (
                  <p className="install-dialog-progress backup-progress-bytes">{progressBytes}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {error ? <p className="install-dialog-error">{error}</p> : null}

        <div className="install-dialog-actions">
          {forceVanillaOnly ? (
            <button
              type="button"
              className="btn primary"
              disabled={busy || !vanillaDir}
              onClick={() => void runVanilla()}
            >
              Create vanilla
            </button>
          ) : null}
          {!forceVanillaOnly && mode === 'manage' && manageTab === 'create' ? (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void runSnapshot()}
            >
              Save snapshot
            </button>
          ) : null}
          {mode === 'manage' && manageTab === 'restore' ? (
            <button
              type="button"
              className="btn primary"
              disabled={busy || !selectedPath}
              onClick={() => void runRestore()}
            >
              Restore
            </button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete snapshot?"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          void confirmDelete()
        }}
      />
    </div>
  )
}
