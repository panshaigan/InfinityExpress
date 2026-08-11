import { useEffect, useRef, useState } from 'react'
import type { BackupManifest } from '../../lib/install/types'
import {
  backupGameDir,
  createNamedBackup,
  listBackups,
  listenBackupProgress,
  restoreGameDir,
  type BackupProgress,
} from '../../lib/desktop/weiduInstall'
import { useBackdropDismiss } from '../backdropDismiss'
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
}

function defaultSnapshotName(): string {
  return `snapshot-${Date.now()}`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
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
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(busy ? undefined : onClose)

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
    setManageTab(initialManageTab)
    if (mode === 'manage') setSnapshotName(defaultSnapshotName())
    panelRef.current?.focus()
  }, [open, mode, initialManageTab])

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

  async function runBaseline() {
    setBusy(true)
    setError(null)
    setProgress({ phase: 'start', message: 'Starting baseline…', filesDone: 0, bytesDone: 0 })
    try {
      await backupGameDir({
        sourceDir,
        backupRoot,
        gameKey,
        kind: 'baseline',
        excludeSafeDirs,
      })
      pushToast({ tone: 'success', message: 'Baseline backup created.' })
      onBaselineDone()
      onClose()
    } catch (e) {
      const message = String(e)
      setError(message)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function runSnapshot() {
    setBusy(true)
    setError(null)
    setProgress({ phase: 'start', message: 'Starting snapshot…', filesDone: 0, bytesDone: 0 })
    try {
      await createNamedBackup({
        sourceDir,
        backupRoot,
        gameKey,
        kind: 'snapshot',
        name: snapshotName.trim() || defaultSnapshotName(),
        excludeSafeDirs,
      })
      pushToast({ tone: 'success', message: 'Snapshot saved.' })
      onClose()
    } catch (e) {
      const message = String(e)
      setError(message)
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
    setProgress({ phase: 'restore', message: 'Restoring…', filesDone: 0, bytesDone: 0 })
    try {
      await restoreGameDir(selectedPath, targetDir)
      pushToast({ tone: 'success', message: 'Backup restored.' })
      onRestoreDone(selectedPath)
      onClose()
    } catch (e) {
      const message = String(e)
      setError(message)
      pushToast({ tone: 'error', message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const entries = [
    ...(manifest?.baseline ? [manifest.baseline] : []),
    ...(manifest?.snapshots ?? []),
  ]

  const progressLabel = progress
    ? progress.filesDone > 0
      ? `${progress.message} — ${progress.filesDone} files · ${formatBytes(progress.bytesDone)}`
      : progress.message
    : null

  return (
    <div className="keyboard-help-backdrop" role="presentation" {...backdrop}>
      <div
        ref={panelRef}
        className="keyboard-help settings-dialog backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
        tabIndex={-1}
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
            >
              Back up
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={manageTab === 'restore'}
              className={`settings-dialog-tab${manageTab === 'restore' ? ' active' : ''}`}
              onClick={() => setManageTab('restore')}
            >
              Restore
            </button>
          </div>
        ) : null}

        {mode === 'baseline' || (mode === 'manage' && manageTab === 'backup') ? (
          <div className="settings-fields">
            <label className="install-filter-toggle">
              <input
                type="checkbox"
                checked={excludeSafeDirs}
                onChange={(e) => setExcludeSafeDirs(e.target.checked)}
                disabled={busy}
              />
              <span>Exclude movies and music</span>
            </label>
            {mode === 'manage' ? (
              <label className="outlined-field">
                <span>Name</span>
                <input
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : null}
          </div>
        ) : (
          <div className="backup-restore-list ie-scroll">
            {entries.length === 0 ? (
              <p>No backups found for this game folder.</p>
            ) : (
              <ul>
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <label>
                      <input
                        type="radio"
                        name="backup-choice"
                        checked={selectedPath === entry.path}
                        onChange={() => setSelectedPath(entry.path)}
                        disabled={busy}
                      />
                      <span>
                        {entry.kind === 'baseline' ? 'Baseline' : entry.name}
                        {entry.excludeSafeDirs ? ' (partial)' : ' (full)'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {progress ? (
          <div className="install-dialog-progress-block">
            <div
              className="mods-row-progress-bar"
              data-indeterminate="true"
              role="progressbar"
              aria-valuetext={progressLabel ?? undefined}
            />
            <p className="install-dialog-progress">{progressLabel}</p>
          </div>
        ) : null}
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
    </div>
  )
}
