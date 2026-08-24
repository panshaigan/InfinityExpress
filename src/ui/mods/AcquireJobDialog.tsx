import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AcquireJobState, JobKind } from '../../hooks/useModAcquireJob'
import { formatBytes } from '../../lib/mods/loadMods'
import { useBackdropDismiss } from '../backdropDismiss'
import { IconTip } from '../IconTip'

interface Props {
  job: AcquireJobState
  onMinimize: () => void
  onCancel: () => void
  onClose: () => void
}

function acquireBarProgress(job: AcquireJobState): {
  pct: number | null
  ariaText: string
  indeterminate: boolean
} {
  if (job.kind === 'check') {
    const pct =
      job.totalCount > 0
        ? Math.min(100, Math.round((job.doneCount / job.totalCount) * 100))
        : 0
    return {
      pct,
      ariaText: `${job.doneCount} of ${job.totalCount} mods checked`,
      indeterminate: false,
    }
  }

  const p = job.progress
  if (
    p?.phase === 'download' &&
    p.bytesReceived != null &&
    p.bytesTotal != null &&
    p.bytesTotal > 0
  ) {
    const pct = Math.min(
      100,
      Math.round((p.bytesReceived / p.bytesTotal) * 100),
    )
    return {
      pct,
      ariaText: `${formatBytes(p.bytesReceived)} of ${formatBytes(p.bytesTotal)} downloaded`,
      indeterminate: false,
    }
  }

  if (p?.phase === 'download' && p.bytesReceived != null && p.bytesReceived > 0) {
    return {
      pct: null,
      ariaText: `${formatBytes(p.bytesReceived)} downloaded`,
      indeterminate: true,
    }
  }

  if (p?.message) {
    return { pct: 0, ariaText: p.message, indeterminate: false }
  }

  return { pct: 0, ariaText: 'Preparing download…', indeterminate: false }
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

export function AcquireJobDialog({ job, onMinimize, onCancel, onClose }: Props) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [hideUpToDate, setHideUpToDate] = useState(true)

  const dismiss = job.running ? onMinimize : onClose
  const backdrop = useBackdropDismiss(dismiss)

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
    if (job.running) cancelRef.current?.focus()
    else panelRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismiss()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [job.open, job.running, dismiss])

  if (!job.open) return null

  const { pct, ariaText, indeterminate } = acquireBarProgress(job)
  const title = job.kind === 'check' ? 'Check for updates' : 'Download / Update'
  const byteLine =
    job.progress?.bytesReceived != null
      ? job.progress.bytesTotal != null
        ? `${formatBytes(job.progress.bytesReceived)} / ${formatBytes(job.progress.bytesTotal)}`
        : formatBytes(job.progress.bytesReceived)
      : null

  return (
    <div
      className="keyboard-help-backdrop"
      role="presentation"
      {...backdrop}
    >
      <div
        ref={panelRef}
        className="keyboard-help acquire-job-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id={titleId}>{title}</h2>
          <div className="acquire-job-header-actions">
            {job.running ? (
              <button
                ref={cancelRef}
                type="button"
                className="btn secondary has-icon-tip"
                onClick={onCancel}
              >
                Cancel
                <IconTip>Stop the job and skip remaining mods</IconTip>
              </button>
            ) : null}
          </div>
        </div>

        <div className="acquire-job-dialog-body">
          <div className="acquire-job-overall" aria-live="polite">
            <div className="acquire-job-overall-meta">
              <span>
                {job.doneCount} / {job.totalCount}
              </span>
              {job.running && job.activeCodename ? (
                <span className="acquire-job-active">{job.activeCodename}</span>
              ) : null}
            </div>
            <div
              className="acquire-job-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
              aria-valuetext={ariaText}
            >
              <div
                className={`acquire-job-bar-fill${indeterminate ? ' indeterminate' : ''}`}
                style={pct != null && pct > 0 ? { width: `${pct}%` } : undefined}
              />
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

          <div className="acquire-job-log" role="log">
            {visibleEntries.map((entry) => (
              <div
                key={entry.codename}
                className={`acquire-job-entry acquire-job-entry-${entry.status}`}
              >
                <strong className="acquire-job-entry-code">
                  {entry.codename}
                </strong>
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
              GitHub rate limits may apply. Add a personal access token in
              Settings for full-catalog checks.
            </p>
          ) : null}

          {job.summary ? (
            <p className="acquire-job-summary" role="status">
              {job.summary}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
