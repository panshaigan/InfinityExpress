import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AcquireJobState, JobKind } from '../../hooks/useModAcquireJob'
import { formatBytes } from '../../lib/mods/loadMods'

interface Props {
  job: AcquireJobState
  onMinimize: () => void
  onClose: () => void
}

function statusLabel(status: string, kind: JobKind): string {
  switch (status) {
    case 'pending':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'ok':
      return kind === 'check' ? 'Available' : 'Downloaded'
    case 'updated':
      return kind === 'check' ? 'Update available' : 'Updated'
    case 'up_to_date':
      return 'Up to date'
    case 'failed':
      return 'Failed'
    case 'skipped':
      return 'Skipped'
    default:
      return status
  }
}

export function AcquireJobDialog({ job, onMinimize, onClose }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const [hideUpToDate, setHideUpToDate] = useState(true)

  const visibleEntries = useMemo(
    () =>
      hideUpToDate
        ? job.entries.filter((e) => e.status !== 'up_to_date')
        : job.entries,
    [hideUpToDate, job.entries],
  )

  const upToDateCount = useMemo(
    () => job.entries.filter((e) => e.status === 'up_to_date').length,
    [job.entries],
  )

  useEffect(() => {
    if (!job.open) return
    closeRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (job.running) onMinimize()
        else onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [job.open, job.running, onClose, onMinimize])

  useEffect(() => {
    if (!job.open) return
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleEntries, job.progress, job.open])

  if (!job.open) return null

  const pct =
    job.totalCount > 0
      ? Math.min(100, Math.round((job.doneCount / job.totalCount) * 100))
      : 0
  const title = job.kind === 'check' ? 'Check for updates' : 'Download / Update'
  const byteLine =
    job.progress?.bytesReceived != null
      ? job.progress.bytesTotal != null
        ? `${formatBytes(job.progress.bytesReceived)} / ${formatBytes(job.progress.bytesTotal)}`
        : formatBytes(job.progress.bytesReceived)
      : null

  return (
    <div className="keyboard-help-backdrop" role="presentation">
      <div
        className="keyboard-help acquire-job-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id={titleId}>{title}</h2>
          <div className="acquire-job-header-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={onMinimize}
              title="Minimize and keep the job running"
            >
              Minimize
            </button>
            <button
              ref={closeRef}
              type="button"
              className="btn secondary keyboard-help-close"
              onClick={() => {
                if (job.running) onMinimize()
                else onClose()
              }}
            >
              {job.running ? 'Hide' : 'Close'}
            </button>
          </div>
        </div>

        <div className="acquire-job-overall" aria-live="polite">
          <div className="acquire-job-overall-meta">
            <span>
              {job.doneCount} / {job.totalCount}
            </span>
            {job.running && job.activeCodename ? (
              <span className="acquire-job-active">{job.activeCodename}</span>
            ) : null}
          </div>
          <div className="acquire-job-bar" aria-hidden="true">
            <div className="acquire-job-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          {job.progress?.message ? (
            <p className="acquire-job-progress-msg">
              {job.progress.message}
              {byteLine ? ` · ${byteLine}` : ''}
            </p>
          ) : null}
        </div>

        <label className="acquire-job-filter">
          <input
            type="checkbox"
            checked={hideUpToDate}
            onChange={(e) => setHideUpToDate(e.target.checked)}
          />
          Hide up to date
          {upToDateCount > 0 ? (
            <span className="acquire-job-filter-count">({upToDateCount})</span>
          ) : null}
        </label>

        <div className="acquire-job-log" ref={logRef} role="log">
          {visibleEntries.map((entry) => (
            <div
              key={entry.codename}
              className={`acquire-job-entry acquire-job-entry-${entry.status}`}
            >
              <strong className="acquire-job-entry-code">{entry.codename}</strong>
              <span className="acquire-job-entry-status">
                {statusLabel(entry.status, job.kind)}
              </span>
              <span className="acquire-job-entry-msg">{entry.message}</span>
            </div>
          ))}
          {visibleEntries.length === 0 && job.entries.length > 0 ? (
            <p className="acquire-job-filter-empty">
              All checked mods are up to date.
            </p>
          ) : null}
        </div>

        {job.rateLimitHint ? (
          <p className="acquire-job-hint" role="status">
            GitHub rate limits may apply. Add a personal access token in Settings
            for full-catalog checks.
          </p>
        ) : null}

        {job.summary ? (
          <p className="acquire-job-summary" role="status">
            {job.summary}
          </p>
        ) : null}
      </div>
    </div>
  )
}
