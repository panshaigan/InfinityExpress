import { useEffect, useState } from 'react'
import type { BackupManifest } from '../../lib/install/types'
import {
  backupGameDir,
  createNamedBackup,
  listBackups,
  listenBackupProgress,
  restoreGameDir,
  type BackupProgress,
} from '../../lib/desktop/weiduInstall'

export type BackupDialogMode = 'baseline' | 'snapshot' | 'restore'

interface Props {
  open: boolean
  mode: BackupDialogMode
  backupRoot: string
  gameKey: string
  sourceDir: string
  targetDir: string
  onClose: () => void
  onBaselineDone: () => void
  onRestoreDone: (backupPath: string) => void
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
  backupRoot,
  gameKey,
  sourceDir,
  targetDir,
  onClose,
  onBaselineDone,
  onRestoreDone,
}: Props) {
  const [excludeSafeDirs, setExcludeSafeDirs] = useState(false)
  const [snapshotName, setSnapshotName] = useState(defaultSnapshotName)
  const [manifest, setManifest] = useState<BackupManifest | null>(null)
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null)

  useEffect(() => {
    if (!open || mode !== 'restore') return
    void listBackups(backupRoot, gameKey).then(setManifest).catch(() => setManifest(null))
  }, [open, mode, backupRoot, gameKey])

  useEffect(() => {
    if (!open) return
    setError(null)
    setProgress(null)
    if (mode === 'snapshot') setSnapshotName(defaultSnapshotName())
  }, [open, mode])

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
      onBaselineDone()
      onClose()
    } catch (e) {
      setError(String(e))
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
      onClose()
    } catch (e) {
      setError(String(e))
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
      onRestoreDone(selectedPath)
      onClose()
    } catch (e) {
      setError(String(e))
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
    <div className="keyboard-help-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="keyboard-help settings-dialog backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="backup-dialog-title">
            {mode === 'baseline'
              ? 'Baseline backup'
              : mode === 'snapshot'
                ? 'Save snapshot'
                : 'Restore backup'}
          </h2>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {mode !== 'restore' ? (
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
            {mode === 'snapshot' ? (
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
          <div className="backup-restore-list">
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
          {mode === 'snapshot' ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void runSnapshot()}>
              Save snapshot
            </button>
          ) : null}
          {mode === 'restore' ? (
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
