import { useState, type ReactNode } from 'react'
import type { InstallStep } from '../../lib/install/types'
import { readTextFile } from '../../lib/desktop/fsDialogs'
import {
  effectiveModFields,
  type WorkingMod,
} from '../../lib/mods/loadMods'
import { withHtmlPreviewIfNeeded } from '../../lib/mods/modFieldParse'
import { formatModSize } from '../../lib/mods/modsTable'
import type { InstallSequenceModel } from '../../lib/xml/schema'
import { isHttpUrl } from '../../lib/url'
import { DetailResizeHandle } from '../DetailResizeHandle'
import { IconTip } from '../IconTip'
import { InstallLogDialog } from './InstallLogDialog'

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

type LogKind = 'stdout' | 'stderr' | 'debug'

interface Props {
  step: InstallStep | null
  selectedComponentId: string | null
  model: InstallSequenceModel
  mods: WorkingMod[]
  collapsed: boolean
  width: number
  onWidthChange: (width: number) => void
  onToggleCollapsed: () => void
}

function DetailBlock({
  kind,
  title,
  children,
}: {
  kind: 'component' | 'mod' | 'logs'
  title: string
  children: ReactNode
}) {
  return (
    <section className={`detail-block detail-block-${kind}`}>
      <h4 className="detail-block-title">{title}</h4>
      <div className="detail-block-body">{children}</div>
    </section>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <button
      type="button"
      className="detail-copy-name has-icon-tip"
      onClick={() => void onCopy()}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? (
        <svg className="detail-copy-name-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 4.6-4.6L12.2 5.5z" />
        </svg>
      ) : (
        <svg className="detail-copy-name-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.5 2A1.5 1.5 0 0 0 4 3.5v7A1.5 1.5 0 0 0 5.5 12h5A1.5 1.5 0 0 0 12 10.5v-7A1.5 1.5 0 0 0 10.5 2zm0 1h5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5zM2.5 5v7.5A1.5 1.5 0 0 0 4 14h6.5v-1H4a.5.5 0 0 1-.5-.5V5z"
          />
        </svg>
      )}
      <span className="icon-tip" role="tooltip">
        {copied ? 'Copied' : label}
      </span>
    </button>
  )
}

function LinkValue({
  href,
  label,
  htmlPreview,
}: {
  href: string
  label?: string
  htmlPreview?: boolean
}) {
  const resolved = htmlPreview && href ? withHtmlPreviewIfNeeded(href) : href
  if (!isHttpUrl(resolved)) return <span>{resolved || '—'}</span>
  return (
    <a href={resolved} target="_blank" rel="noreferrer">
      {label ?? resolved}
    </a>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="outlined-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const LOG_LABELS: Record<LogKind, string> = {
  stdout: 'Standard output',
  stderr: 'Standard error',
  debug: 'Debug log',
}

export function InstallDetailPane({
  step,
  selectedComponentId,
  model,
  mods,
  collapsed,
  width,
  onWidthChange,
  onToggleCollapsed,
}: Props) {
  const [logDialog, setLogDialog] = useState<{
    kind: LogKind
    path: string
    title: string
  } | null>(null)
  const [logContents, setLogContents] = useState<string | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const componentId =
    selectedComponentId ??
    (step?.componentIds.length === 1 ? step.componentIds[0] : null)
  const component = componentId ? model.componentsById.get(componentId) : undefined
  const mod = step
    ? mods.find((m) => m.codename.toLowerCase() === step.modId.toLowerCase())
    : undefined
  const eff = mod ? effectiveModFields(mod) : null

  async function openLog(kind: LogKind, path: string) {
    const label = component?.attrs.label ?? step?.modId ?? 'step'
    setLogDialog({ kind, path, title: `${LOG_LABELS[kind]} — ${label}` })
    setLogContents(null)
    setLogError(null)
    setLogLoading(true)
    const text = await readTextFile(path)
    setLogLoading(false)
    if (text == null) setLogError('Could not read log file.')
    else setLogContents(text)
  }

  function closeLog() {
    setLogDialog(null)
    setLogContents(null)
    setLogError(null)
    setLogLoading(false)
  }

  const logEntries: { kind: LogKind; path: string }[] = []
  if (step?.stdoutLogPath) logEntries.push({ kind: 'stdout', path: step.stdoutLogPath })
  if (step?.stderrLogPath) logEntries.push({ kind: 'stderr', path: step.stderrLogPath })
  if (step?.debugLogPath) logEntries.push({ kind: 'debug', path: step.debugLogPath })

  return (
    <>
      {!collapsed && (
        <DetailResizeHandle width={width} onWidthChange={onWidthChange} />
      )}
      <aside
        className={`detail-pane install-detail-pane${collapsed ? ' collapsed' : ''}`}
        aria-label="Install step details"
      >
        {collapsed ? (
          <button
            type="button"
            className="detail-pane-expand has-icon-tip"
            onClick={onToggleCollapsed}
            aria-expanded={false}
            aria-label="Show details"
          >
            <span className="detail-pane-expand-label">Details</span>
            <IconTip>Show details (;)</IconTip>
          </button>
        ) : (
          <>
            <div className="detail-pane-chrome">
              <span className="detail-pane-chrome-label">Details</span>
              <button
                type="button"
                className="detail-pane-collapse has-icon-tip"
                onClick={onToggleCollapsed}
                aria-expanded={true}
                aria-label="Hide details"
              >
                »
                <IconTip>Hide details (;)</IconTip>
              </button>
            </div>
            <div className="detail-pane-scroll">
              {!step ? (
                <div className="empty-panel">
                  <p className="empty-panel-title">No step selected</p>
                  <p className="empty-panel-body">Select a row to inspect component and mod details.</p>
                </div>
              ) : (
                <div className="component-detail install-step-detail">
                  <div className="detail-blocks">
                    <DetailBlock kind="component" title="Component">
                      <dl className="outlined-fields">
                        {componentId ? (
                          <Field label="Id">
                            <span className="detail-name-value">
                              <span>{componentId}</span>
                              <CopyButton value={componentId} label="Copy id" />
                            </span>
                          </Field>
                        ) : step.componentIds.length > 1 ? (
                          <Field label="Ids">
                            <ul className="install-detail-list">
                              {step.componentIds.map((id) => (
                                <li key={id}>{id}</li>
                              ))}
                            </ul>
                          </Field>
                        ) : null}
                        {component?.attrs.name ? (
                          <Field label="WeiDU Label">
                            <span className="detail-name-value">
                              <span>{component.attrs.name}</span>
                              <CopyButton value={component.attrs.name} label="Copy WeiDU label" />
                            </span>
                          </Field>
                        ) : null}
                        <Field label="Status">{STATUS_LABEL[step.status]}</Field>
                        {step.weiduNumbers.length > 0 ? (
                          <Field label="WeiDU #">{step.weiduNumbers.join(', ')}</Field>
                        ) : null}
                        {step.languageIndex != null ? (
                          <Field label="Language">{step.languageIndex}</Field>
                        ) : null}
                        {step.warnings.length > 0 ? (
                          <Field label="Warnings">
                            <ul className="install-detail-list">
                              {step.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </Field>
                        ) : null}
                        {step.errors.length > 0 ? (
                          <Field label="Errors">
                            <ul className="install-detail-list install-detail-errors">
                              {step.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </Field>
                        ) : null}
                      </dl>
                    </DetailBlock>

                    {eff ? (
                      <DetailBlock kind="mod" title="Mod">
                        <dl className="outlined-fields mod-detail-dl">
                          <Field label="Name">{eff.name || eff.codename}</Field>
                          <Field label="Download ID">{eff.codename}</Field>
                          <Field label="Category">{eff.category || '—'}</Field>
                          <Field label="Type">{eff.type || '—'}</Field>
                          <Field label="Stability">{eff.stability || '—'}</Field>
                          <Field label="Version">{eff.version || '—'}</Field>
                          <Field label="Size">{formatModSize(eff.sizeBytes)}</Field>
                          <Field label="URL">
                            <LinkValue href={eff.url} />
                          </Field>
                          <Field label="Readme">
                            <LinkValue href={eff.readme} htmlPreview />
                          </Field>
                        </dl>
                      </DetailBlock>
                    ) : (
                      <DetailBlock kind="mod" title="Mod">
                        <dl className="outlined-fields">
                          <Field label="Download ID">{step.modId}</Field>
                        </dl>
                      </DetailBlock>
                    )}

                    {logEntries.length > 0 ? (
                      <DetailBlock kind="logs" title="Logs">
                        <ul className="install-detail-log-list">
                          {logEntries.map(({ kind, path }) => (
                            <li key={kind}>
                              <button
                                type="button"
                                className="install-detail-log-link"
                                onClick={() => void openLog(kind, path)}
                              >
                                {LOG_LABELS[kind]}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </DetailBlock>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      <InstallLogDialog
        open={logDialog != null}
        title={logDialog?.title ?? 'Log'}
        contents={logContents}
        loading={logLoading}
        error={logError}
        onClose={closeLog}
      />
    </>
  )
}
