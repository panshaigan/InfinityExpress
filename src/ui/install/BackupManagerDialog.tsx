import { useEffect, useState } from 'react'
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

export type BackupDialogMode = 'baseline' | 'manage'

type ManageTab = 'backup' | 'restore'

interface Props {
  open: boolean
  mode: BackupDialogMode
  /** Initial tab when mode is manage. */
  initialManageTab?: ManageTab
  backupRoot: string
  gameKey: string
  sourceDir: string
  targetDir: string
  onClose: () => void
  onBaselineDone: () => void
  onRestoreDone: (backupPath: string) => void
  onBusyChange?: (busy: boolean) => void
  /** Optional install Commands-tab log (timestamped by caller). */
  onLog?: (message: string) => void
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Default snapshot name: snapshot-{Ymd-His} in local time. */
function defaultSnapshotName(now = new Date()): string {
  return `snapshot-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
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
  const base = entry.kind === 'baseline' ? 'Baseline' : 'Snapshot'
  return entry.excludeSafeDirs ? `${base} (partial)` : `${base} (full)`
}

function displayName(entry: BackupEntry): string {
  return entry.kind === 'baseline' ? 'Baseline' : entry.name
}

export function BackupManagerDialog({
  open,
  mode,
  initialManageTab = 'backup',
  backupRoot,
  gameKey,
  sourceDir,
  targetDir,
  onClose,
  onBaselineDone,
  onRestoreDone,
  onBusyChange,
  onLog,
}: Props) {
  const { pushToast } = useToast()
  const [manageTab, setManageTab] = useState<ManageTab>(initialManageTab)
  const [excludeSafeDirs, setExcludeSafeDirs] = useState(false)
  const [snapshotName, setSnapshotName] = useState(defaultSnapshotName)
  const [manifest, setManifest] = useState<BackupManifest | null>(null)
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BackupEntry | null>(null)
  const backdrop = useBackdropDismiss(
    busy || pendingDelete != null ? undefined : onClose,
  )

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  useEffect(() => {
    if (!open || mode !== 'manage' || manageTab !== 'restore') return
    void listBackups(backupRoot, gameKey).then(setManifest).catch(() => setManifest(null))
  }, [open, mode, manageTab, backupRoot, gameKey])

  useEffect(() => {
    if (!open) return
    setError(null)
    setProgress(null)
    setPendingDelete(null)
    setManageTab(initialManageTab)
    if (mode === 'manage') setSnapshotName(defaultSnapshotName())
  }, [open, mode, initialManageTab])

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

  if (!open) return null

  async function refreshManifest() {
    try {
      setManifest(await listBackups(backupRoot, gameKey))
    } catch {
      setManifest(null)
    }
  }

  async function runBaseline() {
    setBusy(true)
    setError(null)
    setProgress(emptyProgress('Starting baseline…'))
    try {
      await backupGameDir({
        sourceDir,
        backupRoot,
        gameKey,
        kind: 'baseline',
        excludeSafeDirs,
      })
      onLog?.(`Baseline backup created (${gameKey})`)
      pushToast({ tone: 'success', message: 'Baseline backup created.' })
      onBaselineDone()
      onClose()
    } catch (e) {
      const message = String(e)
      setError(message)
      onLog?.(`Baseline backup failed: ${message}`)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function runSnapshot() {
    setBusy(true)
    setError(null)
    setProgress(emptyProgress('Starting snapshot…'))
    try {
      const name = snapshotName.trim() || defaultSnapshotName()
      await createNamedBackup({
        sourceDir,
        backupRoot,
        gameKey,
        kind: 'snapshot',
        name,
        excludeSafeDirs,
      })
      onLog?.(`Snapshot "${name}" saved (${gameKey})`)
      pushToast({ tone: 'success', message: 'Snapshot saved.' })
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
    if (!selectedPath) return
    setBusy(true)
    setError(null)
    setProgress(emptyProgress('Restoring…'))
    try {
      await restoreGameDir(selectedPath, targetDir)
      onLog?.(`Backup restored from ${selectedPath}`)
      pushToast({ tone: 'success', message: 'Backup restored.' })
      onRestoreDone(selectedPath)
      onClose()
    } catch (e) {
      const message = String(e)
      setError(message)
      onLog?.(`Backup restore failed: ${message}`)
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
    try {
      await deleteBackup(backupRoot, gameKey, entry.path)
      if (selectedPath === entry.path) setSelectedPath('')
      await refreshManifest()
      onLog?.(`Backup deleted: ${displayName(entry)}`)
      pushToast({ tone: 'success', message: 'Backup deleted.' })
    } catch (e) {
      const message = String(e)
      setError(message)
      onLog?.(`Backup delete failed: ${message}`)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
    }
  }

  const entries = [
    ...(manifest?.baseline ? [manifest.baseline] : []),
    ...(manifest?.snapshots ?? []),
  ]

  const progressPct =
    progress && progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesDone / progress.bytesTotal) * 100))
      : null

  const progressLabel = progress
    ? progress.bytesTotal > 0
      ? `${progress.message} — ${formatBytes(progress.bytesDone)} / ${formatBytes(progress.bytesTotal)}`
      : progress.filesDone > 0
        ? `${progress.message} — ${progress.filesDone} files · ${formatBytes(progress.bytesDone)}`
        : progress.message
    : null

  return (
    <div className="keyboard-help-backdrop" role="presentation" {...backdrop}>
      <div
        className="keyboard-help settings-dialog backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="backup-dialog-title">
            {mode === 'baseline' ? 'Baseline backup' : 'Backups'}
          </h2>
        </div>

        {mode === 'manage' ? (
          <div className="settings-dialog-tabs" role="tablist" aria-label="Backup actions">
            <button
              type="button"
              role="tab"
              aria-selected={manageTab === 'backup'}
              className={`settings-dialog-tab${manageTab === 'backup' ? ' active' : ''}`}
              onClick={() => setManageTab('backup')}
              disabled={busy}
            >
              Back up
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
          {mode === 'baseline' || (mode === 'manage' && manageTab === 'backup') ? (
            <div className="settings-fields">
              {mode === 'manage' ? (
                <OutlinedTextField
                  label="Name"
                  value={snapshotName}
                  onChange={setSnapshotName}
                  disabled={busy}
                />
              ) : null}
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
                <p className="backup-restore-empty">No backups found for this game folder.</p>
              ) : (
                <table className="backup-restore-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
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
                          key={entry.path}
                          className={selected ? 'selected' : undefined}
                          onClick={() => {
                            if (!busy) setSelectedPath(entry.path)
                          }}
                        >
                          <td>
                            <label className="backup-restore-name">
                              <input
                                type="radio"
                                name="backup-choice"
                                checked={selected}
                                onChange={() => setSelectedPath(entry.path)}
                                disabled={busy}
                              />
                              <span>{displayName(entry)}</span>
                            </label>
                          </td>
                          <td>{typeLabel(entry)}</td>
                          <td>{formatCreatedAt(entry.createdAt)}</td>
                          <td className="backup-restore-actions">
                            <button
                              type="button"
                              className="btn secondary install-control-btn has-icon-tip"
                              disabled={busy}
                              aria-label={`Delete ${displayName(entry)}`}
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
                aria-valuetext={progressLabel ?? undefined}
              >
                <div
                  className={`backup-progress-fill${progressPct == null ? ' indeterminate' : ''}`}
                  style={progressPct != null ? { width: `${progressPct}%` } : undefined}
                />
              </div>
              <p className="install-dialog-progress">{progressLabel}</p>
            </>
          ) : null}
        </div>
        {error ? <p className="install-dialog-error">{error}</p> : null}

        <div className="install-dialog-actions">
          {mode === 'baseline' ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void runBaseline()}>
              Create baseline
            </button>
          ) : null}
          {mode === 'manage' && manageTab === 'backup' ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void runSnapshot()}>
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
        title="Delete backup?"
        message={
          pendingDelete
            ? `Delete "${displayName(pendingDelete)}"? This cannot be undone.`
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
