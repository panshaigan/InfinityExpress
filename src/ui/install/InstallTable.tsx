import { useMemo, useState } from 'react'
import type { InstallStep } from '../../lib/install/types'
import { expandStepsToTableRows } from '../../lib/install/planBuilder'
import { IconTip } from '../IconTip'

const STATUS_LABEL: Record<InstallStep['status'], string> = {
  pending: 'Pending',
  installing: 'Installing',
  succeeded: 'Done',
  succeededWithWarnings: 'Warnings',
  failed: 'Failed',
  skipped: 'Skipped',
  alreadyInstalled: 'Installed',
  needsInput: 'Input needed',
}

interface Props {
  steps: InstallStep[]
  selectedStepId: string | null
  onSelectStep: (stepId: string) => void
}

export function InstallTable({ steps, selectedStepId, onSelectStep }: Props) {
  const [hideInstalled, setHideInstalled] = useState(false)
  const rows = useMemo(() => expandStepsToTableRows(steps), [steps])
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
            return (
              <tr
                key={`${row.stepId}-${row.componentId}`}
                className={`install-row${selected ? ' selected' : ''} install-status-${row.status}`}
                onClick={() => onSelectStep(row.stepId)}
              >
                <td>{row.order}</td>
                <td>{row.modId}</td>
                <td>{row.componentLabel}</td>
                <td>
                  <span className={`install-status install-status-${row.status}`}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
