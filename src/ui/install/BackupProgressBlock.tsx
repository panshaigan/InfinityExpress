import type { BackupProgress } from '../../lib/desktop/weiduInstall'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function BackupProgressBlock({
  progress,
}: {
  progress: BackupProgress | null
}) {
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

  return (
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
  )
}
