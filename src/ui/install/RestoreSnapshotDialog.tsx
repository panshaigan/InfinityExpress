import { useEffect, useMemo, useState } from 'react'
import type { BackupEntry, BackupManifest } from '../../lib/install/types'
import {
  deleteBackup,
  listBackups,
  listenBackupProgress,
  restoreGameDir,
  type BackupProgress,
} from '../../lib/desktop/weiduInstall'
import { useBackdropDismiss } from '../backdropDismiss'
import { ConfirmDialog } from '../ConfirmDialog'
import { IconTip } from '../IconTip'
import { DeleteFromCatalogIcon } from '../mods/ModsActionIcons'
import { useToast } from '../toasts/toastContext'
import { BackupProgressBlock } from './BackupProgressBlock'

interface ListedSnapshot extends BackupEntry {
  gameKey: string
}

interface Props {
  open: boolean
  backupRoot: string
  /** Keys to list / operate on (EET: bg1+bg2). */
  gameKeys: string[]
  /** Game folder paths keyed by game key. */
  dirsByKey: Record<string, string>
  targetDir: string
  onClose: () => void
  onRestoreDone: (snapshotPath: string, restoredGameKey: string) => void
  onBusyChange?: (busy: boolean) => void
  /** Optional install Commands-tab log (timestamped by caller). */
  onLog?: (message: string) => void
  onSnapshotsChange?: () => void
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

export function RestoreSnapshotDialog({
  open,
  backupRoot,
  gameKeys,
  dirsByKey,
  targetDir,
  onClose,
  onRestoreDone,
  onBusyChange,
  onLog,
  onSnapshotsChange,
}: Props) {
  const { pushToast } = useToast()
  const [manifests, setManifests] = useState<Record<string, BackupManifest>>({})
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [selectedGameKey, setSelectedGameKey] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ListedSnapshot | null>(null)
  const backdrop = useBackdropDismiss(
    busy || pendingDelete != null ? undefined : onClose,
  )

  const keys = useMemo(
    () => (gameKeys.length > 0 ? gameKeys : []),
    [gameKeys],
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
    setSelectedPath('')
    setSelectedGameKey('')
  }, [open])

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

  const entries: ListedSnapshot[] = keys.flatMap((key) =>
    (manifests[key]?.snapshots ?? []).map((s) => ({ ...s, gameKey: key })),
  )

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
      onSnapshotsChange?.()
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

  return (
    <div className="keyboard-help-backdrop" role="presentation" {...backdrop}>
      <div
        className="keyboard-help settings-dialog backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-snapshot-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="restore-snapshot-dialog-title">Restore snapshot</h2>
        </div>

        <div className="backup-dialog-body">
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
        </div>

        <BackupProgressBlock progress={progress} />
        {error ? <p className="install-dialog-error">{error}</p> : null}

        <div className="install-dialog-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !selectedPath}
            onClick={() => void runRestore()}
          >
            Restore
          </button>
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
