import type { InstallStep } from '../../lib/install/types'
import type { InstallSequenceModel } from '../../lib/xml/schema'
import { DetailResizeHandle } from '../DetailResizeHandle'
import { IconTip } from '../IconTip'
import { isHttpUrl } from '../../lib/url'

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

interface Props {
  step: InstallStep | null
  model: InstallSequenceModel
  collapsed: boolean
  width: number
  onWidthChange: (width: number) => void
  onToggleCollapsed: () => void
}

export function InstallDetailPane({
  step,
  model,
  collapsed,
  width,
  onWidthChange,
  onToggleCollapsed,
}: Props) {
  const componentId = step?.componentIds[0]
  const component = componentId ? model.componentsById.get(componentId) : undefined

  return (
    <aside
      className={`detail-pane install-detail-pane${collapsed ? ' collapsed' : ''}`}
      style={{ width: collapsed ? undefined : width }}
    >
      <div className="detail-pane-header">
        <button
          type="button"
          className="detail-pane-toggle has-icon-tip"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand detail pane' : 'Collapse detail pane'}
        >
          {collapsed ? '‹' : '›'}
          <IconTip>{collapsed ? 'Expand detail' : 'Collapse detail'}</IconTip>
        </button>
        {!collapsed ? <span className="detail-pane-title">Details</span> : null}
      </div>
      {!collapsed ? (
        <>
          <DetailResizeHandle width={width} onWidthChange={onWidthChange} />
          <div className="detail-pane-body">
            {!step ? (
              <p className="detail-empty">Select a row.</p>
            ) : (
              <dl className="detail-fields">
                <div className="outlined-field">
                  <dt>Mod</dt>
                  <dd>{step.modId}</dd>
                </div>
                <div className="outlined-field">
                  <dt>Components</dt>
                  <dd>
                    <ul className="install-detail-list">
                      {step.componentLabels.map((label, i) => (
                        <li key={step.componentIds[i] ?? i}>{label}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div className="outlined-field">
                  <dt>Status</dt>
                  <dd>{STATUS_LABEL[step.status]}</dd>
                </div>
                {step.weiduNumbers.length > 0 ? (
                  <div className="outlined-field">
                    <dt>WeiDU #</dt>
                    <dd>{step.weiduNumbers.join(', ')}</dd>
                  </div>
                ) : null}
                {step.languageIndex != null ? (
                  <div className="outlined-field">
                    <dt>Language</dt>
                    <dd>{step.languageIndex}</dd>
                  </div>
                ) : null}
                {component?.attrs.readme && isHttpUrl(component.attrs.readme) ? (
                  <div className="outlined-field">
                    <dt>Readme</dt>
                    <dd>
                      <a href={component.attrs.readme} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </dd>
                  </div>
                ) : null}
                {step.warnings.length > 0 ? (
                  <div className="outlined-field">
                    <dt>Warnings</dt>
                    <dd>
                      <ul className="install-detail-list">
                        {step.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
                {step.errors.length > 0 ? (
                  <div className="outlined-field">
                    <dt>Errors</dt>
                    <dd>
                      <ul className="install-detail-list install-detail-errors">
                        {step.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
                {step.debugLogPath ? (
                  <div className="outlined-field">
                    <dt>Debug</dt>
                    <dd className="install-detail-path">{step.debugLogPath}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </div>
        </>
      ) : null}
    </aside>
  )
}
