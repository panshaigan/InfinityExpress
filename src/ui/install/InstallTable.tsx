import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { stepDurationLabel } from '../../lib/install/formatDuration'
import type { InstallStep, StepProgress } from '../../lib/install/types'
import { expandStepsToTableRows } from '../../lib/install/planBuilder'
import {
  effectiveModFields,
  type WorkingMod,
} from '../../lib/mods/loadMods'
import type { InstallSequenceModel } from '../../lib/xml/schema'
import { IconTip } from '../IconTip'

export const INSTALL_TABLE_ID = 'install-table'

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

function TipCell({
  className,
  display,
  tip,
}: {
  className?: string
  display: ReactNode
  tip: string | undefined
}) {
  const showTip = !!tip
  return (
    <td className={`${className ?? ''}${showTip ? ' has-icon-tip' : ''}`.trim()}>
      <span className="mods-cell-clip">{display}</span>
      {showTip ? <IconTip>{tip}</IconTip> : null}
    </td>
  )
}

function IdCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy(e: ReactMouseEvent) {
    e.preventDefault()
    e.stopPropagation()
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
      className="mods-url-copy has-icon-tip"
      tabIndex={-1}
      onClick={(e) => void onCopy(e)}
      aria-label={copied ? 'Copied' : 'Copy id'}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 4.6-4.6L12.2 5.5z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.5 2A1.5 1.5 0 0 0 4 3.5v7A1.5 1.5 0 0 0 5.5 12h5A1.5 1.5 0 0 0 12 10.5v-7A1.5 1.5 0 0 0 10.5 2zm0 1h5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5zM2.5 5v7.5A1.5 1.5 0 0 0 4 14h6.5v-1H4a.5.5 0 0 1-.5-.5V5z"
          />
        </svg>
      )}
      <IconTip>{copied ? 'Copied' : 'Copy id'}</IconTip>
    </button>
  )
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
  model: InstallSequenceModel
  mods: WorkingMod[]
  selectedStepId: string | null
  selectedComponentId: string | null
  activeStepId: string | null
  hideInstalled: boolean
  onSelectStep: (stepId: string, componentId: string) => void
}

export function InstallTable({
  steps,
  model,
  mods,
  selectedStepId,
  selectedComponentId,
  activeStepId,
  hideInstalled,
  onSelectStep,
}: Props) {
  const rows = useMemo(() => expandStepsToTableRows(steps), [steps])
  const stepById = useMemo(() => {
    const map = new Map<string, InstallStep>()
    for (const s of steps) map.set(s.stepId, s)
    return map
  }, [steps])
  const modsByCodename = useMemo(() => {
    const map = new Map<string, WorkingMod>()
    for (const m of mods) map.set(m.codename.toLowerCase(), m)
    return map
  }, [mods])
  const visible = useMemo(
    () =>
      hideInstalled
        ? rows.filter(
            (r) => r.status !== 'succeeded' && r.status !== 'alreadyInstalled',
          )
        : rows,
    [rows, hideInstalled],
  )

  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())

  const anyRunning = useMemo(
    () => steps.some((s) => !!s.startedAt && !s.finishedAt),
    [steps],
  )

  useEffect(() => {
    if (!anyRunning) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [anyRunning])

  const rowKey = (stepId: string, componentId: string) =>
    `${stepId}\0${componentId}`

  const setRowEl = useCallback(
    (stepId: string, componentId: string, el: HTMLTableRowElement | null) => {
      const key = rowKey(stepId, componentId)
      if (el) rowRefs.current.set(key, el)
      else rowRefs.current.delete(key)
    },
    [],
  )

  const selectIndex = useCallback(
    (index: number) => {
      const row = visible[index]
      if (!row) return
      onSelectStep(row.stepId, row.componentId)
      requestAnimationFrame(() => {
        const el = rowRefs.current.get(rowKey(row.stepId, row.componentId))
        if (el && document.activeElement !== el) el.focus()
      })
    },
    [onSelectStep, visible],
  )

  const selectRow = useCallback(
    (stepId: string, componentId: string) => {
      onSelectStep(stepId, componentId)
      requestAnimationFrame(() => {
        const el = rowRefs.current.get(rowKey(stepId, componentId))
        if (el && document.activeElement !== el) el.focus()
      })
    },
    [onSelectStep],
  )

  useEffect(() => {
    if (!selectedStepId || !selectedComponentId) return
    const el = rowRefs.current.get(rowKey(selectedStepId, selectedComponentId))
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedStepId, selectedComponentId])

  function handleTableKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (visible.length === 0) return
    const current =
      selectedStepId && selectedComponentId
        ? visible.findIndex(
            (r) =>
              r.stepId === selectedStepId &&
              r.componentId === selectedComponentId,
          )
        : 0
    const idx = current < 0 ? 0 : current

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectIndex(Math.min(idx + 1, visible.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectIndex(Math.max(idx - 1, 0))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      selectIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      selectIndex(visible.length - 1)
      return
    }
  }

  return (
    <div className="install-table-wrap">
      <div
        id={INSTALL_TABLE_ID}
        className="mods-table-wrap install-table-scroll"
        role="grid"
        aria-label="Install steps"
        tabIndex={visible.length === 0 ? 0 : -1}
        onKeyDown={handleTableKeyDown}
        onFocus={() => {
          if ((!selectedStepId || !selectedComponentId) && visible[0]) {
            onSelectStep(visible[0].stepId, visible[0].componentId)
          }
        }}
      >
        <table className="install-table mods-table">
          <colgroup>
            <col className="install-col-num" />
            <col className="install-col-mod" />
            <col className="install-col-component" />
            <col className="install-col-component-id" />
            <col className="install-col-category" />
            <col className="install-col-type" />
            <col className="install-col-duration" />
            <col className="install-col-status" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Mod</th>
              <th scope="col">Component</th>
              <th scope="col">Component id</th>
              <th scope="col">Category</th>
              <th scope="col">Type</th>
              <th scope="col">Duration</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody onMouseLeave={() => setHoveredStepId(null)}>
            {visible.map((row) => {
              const selected = row.stepId === selectedStepId
              const active = row.stepId === activeStepId
              const batchHover = row.stepId === hoveredStepId
              const focused =
                selected && row.componentId === selectedComponentId
              const step = stepById.get(row.stepId)
              const mod = modsByCodename.get(row.modId.toLowerCase())
              const eff = mod ? effectiveModFields(mod) : null
              const modDisplay = eff?.name?.trim() || row.modId
              const modTip = mod?.codename ?? row.modId
              const weiduName = model.componentsById
                .get(row.componentId)
                ?.attrs.name?.trim()
              const category = eff?.category?.trim() || ''
              const type = eff?.type?.trim() || ''
              const duration =
                step != null ? stepDurationLabel(step, nowMs) : null
              const batchClass =
                row.batchSize > 1
                  ? row.isFirstInStep
                    ? ' install-row-batch-start'
                    : ' install-row-batch-cont'
                  : ''

              return (
                <tr
                  key={`${row.stepId}-${row.componentId}`}
                  ref={(el) => setRowEl(row.stepId, row.componentId, el)}
                  role="row"
                  tabIndex={focused ? 0 : -1}
                  className={`install-row${selected ? ' selected' : ''}${active ? ' active' : ''}${batchHover ? ' batch-hover' : ''}${focused ? ' focused' : ''}${batchClass} install-status-${row.status}`}
                  onClick={() => selectRow(row.stepId, row.componentId)}
                  onMouseEnter={() => setHoveredStepId(row.stepId)}
                >
                  <td className="install-col-num">
                    {row.isFirstInStep ? row.order : null}
                  </td>
                  {row.isFirstInStep ? (
                    <TipCell
                      className="install-col-mod"
                      display={modDisplay}
                      tip={modTip}
                    />
                  ) : (
                    <td className="install-col-mod" />
                  )}
                  <TipCell
                    className="install-col-component"
                    display={row.componentLabel}
                    tip={weiduName || undefined}
                  />
                  <td className="install-col-component-id">
                    <span className="install-id-cell">
                      <span className="mods-cell-clip">{row.componentId}</span>
                      <IdCopyButton value={row.componentId} />
                    </span>
                  </td>
                  <td className="install-col-category">
                    {row.isFirstInStep ? (
                      <span className="mods-cell-clip">
                        {category || '—'}
                      </span>
                    ) : null}
                  </td>
                  <td className="install-col-type">
                    <span className="mods-cell-clip">{type || '—'}</span>
                  </td>
                  <td className="install-col-duration">
                    <span className="mods-cell-clip">{duration ?? '—'}</span>
                  </td>
                  <td className="install-col-status">
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
