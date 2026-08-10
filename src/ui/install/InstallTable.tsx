import { useMemo, useState } from 'react'
import type { InstallStep, StepProgress } from '../../lib/install/types'
import { expandStepsToTableRows } from '../../lib/install/planBuilder'
import { IconTip } from '../IconTip'

const STATUS_LABEL: Record<InstallStep['status'], string> = {
  queued: 'Queued',
  copying: 'Copying',
  installing: 'Installing',
  succeeded: 'Done',
  succeededWithWarnings: 'Warnings',
  failed: 'Failed',
  skipped: 'Skipped',
  alreadyInstalled: 'Installed',
  needsInput: 'Input needed',
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function StatusCell({
  status,
  progress,
}: {
  status: InstallStep['status']
  progress?: StepProgress | null
}) {
  const showBar = status === 'copying' || status === 'installing'
  if (!showBar) {
    return (
      <span className={`install-status install-status-${status}`}>
        {STATUS_LABEL[status]}
      </span>
    )
  }
  const label =
    progress?.label ??
    (status === 'copying'
      ? progress
        ? `${progress.filesDone} files · ${formatBytes(progress.bytesDone)}`
        : 'Copying…'
      : 'Installing…')
  return (
    <div className="mods-row-progress install-row-progress">
      <span className={`install-status install-status-${status}`}>
        {STATUS_LABEL[status]}
      </span>
      <div
        className="mods-row-progress-bar"
        data-indeterminate="true"
        role="progressbar"
        aria-valuetext={label}
      />
      <span className="mods-row-progress-label">{label}</span>
    </div>
  )
}

interface Props {
  steps: InstallStep[]
  selectedStepId: string | null
  activeStepId: string | null
  onSelectStep: (stepId: string) => void
}

export function InstallTable({
  steps,
  selectedStepId,
  activeStepId,
  onSelectStep,
}: Props) {
  const [hideInstalled, setHideInstalled] = useState(false)
  const rows = useMemo(() => expandStepsToTableRows(steps), [steps])
  const stepById = useMemo(() => {
    const map = new Map<string, InstallStep>()
    for (const s of steps) map.set(s.stepId, s)
    return map
  }, [steps])
  const visible = useMemo(
    () =>
      hideInstalled
        ? rows.filter(
            (r) => r.status !== 'succeeded' && r.status !== 'alreadyInstalled',
          )
        : rows,
    [rows, hideInstalled],
  )

  return (
    <div className="install-table-wrap">
      <div className="install-table-toolbar">
        <label className="install-filter-toggle">
          <input
            type="checkbox"
            checked={hideInstalled}
            onChange={(e) => setHideInstalled(e.target.checked)}
          />
          <span>Hide installed</span>
        </label>
        <span className="has-icon-tip install-table-help">
          <button type="button" className="btn icon-only install-help-btn" aria-label="Help">
            ?
          </button>
          <IconTip>Rows follow install order. Status reflects the WeiDU step that contains the component.</IconTip>
        </span>
      </div>
      <div className="mods-table-wrap install-table-scroll">
        <table className="install-table mods-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Mod</th>
              <th scope="col">Component</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const selected = row.stepId === selectedStepId
              const active = row.stepId === activeStepId
              const step = stepById.get(row.stepId)
              return (
                <tr
                  key={`${row.stepId}-${row.componentId}`}
                  className={`install-row${selected ? ' selected' : ''}${active ? ' active' : ''} install-status-${row.status}`}
                  onClick={() => onSelectStep(row.stepId)}
                >
                  <td>{row.order}</td>
                  <td>{row.modId}</td>
                  <td>{row.componentLabel}</td>
                  <td>
                    <StatusCell status={row.status} progress={step?.progress} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
