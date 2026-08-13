import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { canSetBreakpoint, isStepDone, stepIndexById } from '../../lib/install/cursor'
import { isStepDurationLive, stepDurationLabel } from '../../lib/install/formatDuration'
import type { InstallRunState, InstallStep, StepProgress } from '../../lib/install/types'
import { expandStepsToTableRows } from '../../lib/install/planBuilder'
import {
  effectiveModFields,
  type WorkingMod,
} from '../../lib/mods/loadMods'
import type { InstallSequenceModel } from '../../lib/xml/schema'
import { IconTip } from '../IconTip'
import {
  BreakpointIcon,
  MoveCursorIcon,
  RemoveFromPlanIcon,
  UninstallBackIcon,
} from './InstallControlIcons'
import { canRemoveStepFromPlan, type InstallLock } from '../../lib/install/installLock'

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

interface InstallTableActions {
  runState: InstallRunState | null
  cursor: number
  breakpointStepIds: string[]
  canNavigate: boolean
  installLock: InstallLock
  onRequestUninstallBack: (stepId: string) => void
  onToggleBreakpoint: (stepId: string) => void
  onRequestMoveCursor: (stepId: string) => void
  onRemoveFromPlan: (stepId: string) => void
}

interface ContextMenuState {
  stepId: string
  x: number
  y: number
}

function InstallStepContextMenu({
  menu,
  step,
  stepIndex,
  actions,
  onClose,
}: {
  menu: ContextMenuState
  step: InstallStep
  stepIndex: number
  actions: InstallTableActions
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ top: menu.y, left: menu.x })
  const hasBreakpoint = actions.breakpointStepIds.includes(step.stepId)
  const canBreakpoint = canSetBreakpoint(
    step,
    stepIndex,
    actions.cursor,
    actions.runState,
  )
  const canUninstallBack =
    actions.canNavigate && stepIndex < actions.cursor && !isStepDone(step.status)
  const canMoveCursor =
    actions.canNavigate || actions.runState === 'running' || actions.runState === 'waitingForInput'
  const moveDisabled = stepIndex === actions.cursor || isStepDone(step.status)
  const canRemove = canRemoveStepFromPlan(stepIndex, step.status, actions.installLock)

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = menu.x
    let top = menu.y
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8)
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8)
    }
    setStyle({ top, left })
  }, [menu.x, menu.y])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  function run(action: () => void) {
    action()
    onClose()
  }

  return createPortal(
    <div
      ref={menuRef}
      className="mods-row-context-menu install-row-context-menu"
      role="menu"
      aria-label="Install step actions"
      style={style}
    >
      <button
        type="button"
        role="menuitem"
        className="mods-row-context-item"
        disabled={!canUninstallBack}
        onClick={() => run(() => actions.onRequestUninstallBack(step.stepId))}
      >
        <UninstallBackIcon />
        <span>Uninstall back to here</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="mods-row-context-item"
        disabled={!canBreakpoint}
        onClick={() => run(() => actions.onToggleBreakpoint(step.stepId))}
      >
        <BreakpointIcon active={hasBreakpoint} />
        <span>{hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="mods-row-context-item"
        disabled={!canMoveCursor || moveDisabled}
        onClick={() => run(() => actions.onRequestMoveCursor(step.stepId))}
      >
        <MoveCursorIcon />
        <span>Move cursor here</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="mods-row-context-item"
        disabled={!canRemove}
        onClick={() => run(() => actions.onRemoveFromPlan(step.stepId))}
      >
        <RemoveFromPlanIcon />
        <span>Remove from plan</span>
      </button>
    </div>,
    document.body,
  )
}

function StepActionButtons({
  step,
  stepIndex,
  actions,
}: {
  step: InstallStep
  stepIndex: number
  actions: InstallTableActions
}) {
  const hasBreakpoint = actions.breakpointStepIds.includes(step.stepId)
  const canBreakpoint = canSetBreakpoint(
    step,
    stepIndex,
    actions.cursor,
    actions.runState,
  )
  const canUninstallBack =
    actions.canNavigate && stepIndex < actions.cursor && !isStepDone(step.status)
  const canMoveCursor =
    actions.canNavigate || actions.runState === 'running' || actions.runState === 'waitingForInput'
  const moveDisabled = stepIndex === actions.cursor || isStepDone(step.status)
  const moveTip = moveDisabled && isStepDone(step.status)
    ? 'Already installed or finished'
    : 'Move cursor here'
  const canRemove = canRemoveStepFromPlan(stepIndex, step.status, actions.installLock)

  return (
    <div className="install-row-actions" onClick={(e) => e.stopPropagation()}>
      <span className="install-row-action-wrap has-icon-tip">
        <button
          type="button"
          className="install-row-action-btn"
          disabled={!canUninstallBack}
          aria-label="Uninstall back to here"
          onClick={() => actions.onRequestUninstallBack(step.stepId)}
        >
          <UninstallBackIcon />
        </button>
        <IconTip>Uninstall back to here</IconTip>
      </span>
      <span className="install-row-action-wrap has-icon-tip">
        <button
          type="button"
          className={`install-row-action-btn${hasBreakpoint ? ' active' : ''}`}
          disabled={!canBreakpoint}
          aria-label={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
          aria-pressed={hasBreakpoint}
          onClick={() => actions.onToggleBreakpoint(step.stepId)}
        >
          <BreakpointIcon active={hasBreakpoint} />
        </button>
        <IconTip>{hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}</IconTip>
      </span>
      <span className="install-row-action-wrap has-icon-tip">
        <button
          type="button"
          className="install-row-action-btn"
          disabled={!canMoveCursor || moveDisabled}
          aria-label={moveTip}
          onClick={() => actions.onRequestMoveCursor(step.stepId)}
        >
          <MoveCursorIcon />
        </button>
        <IconTip>{moveTip}</IconTip>
      </span>
      <span className="install-row-action-wrap has-icon-tip">
        <button
          type="button"
          className="install-row-action-btn"
          disabled={!canRemove}
          aria-label="Remove from plan"
          onClick={() => actions.onRemoveFromPlan(step.stepId)}
        >
          <RemoveFromPlanIcon />
        </button>
        <IconTip>Remove from install plan (unchecks in Components)</IconTip>
      </span>
    </div>
  )
}

interface Props {
  steps: InstallStep[]
  model: InstallSequenceModel
  mods: WorkingMod[]
  selectedStepId: string | null
  selectedComponentId: string | null
  /** Step under `InstallRun.cursor` (install cursor highlight). */
  cursorStepId: string | null
  /** Soft pulse while install is actively running. */
  cursorLive?: boolean
  runState?: InstallRunState | null
  hideInstalled: boolean
  tableActions: InstallTableActions | null
  onSelectStep: (stepId: string, componentId: string) => void
}

export function InstallTable({
  steps,
  model,
  mods,
  selectedStepId,
  selectedComponentId,
  cursorStepId,
  cursorLive = false,
  runState = null,
  hideInstalled,
  tableActions,
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())

  const anyRunning = useMemo(
    () => steps.some((s) => isStepDurationLive(s, runState)),
    [runState, steps],
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
            <col className="install-col-actions" />
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
              <th scope="col" className="install-col-actions-head">
                Actions
              </th>
            </tr>
          </thead>
          <tbody onMouseLeave={() => setHoveredStepId(null)}>
            {visible.map((row) => {
              const selected = row.stepId === selectedStepId
              const atCursor = row.stepId === cursorStepId
              const rowHover = row.stepId === hoveredStepId
              const focused =
                selected && row.componentId === selectedComponentId
              const step = stepById.get(row.stepId)
              const stepIndex = step ? stepIndexById(steps, row.stepId) : -1
              const hasBreakpoint =
                !!step && (tableActions?.breakpointStepIds.includes(row.stepId) ?? false)
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
                step != null ? stepDurationLabel(step, nowMs, runState) : null

              return (
                <tr
                  key={row.stepId}
                  ref={(el) => setRowEl(row.stepId, row.componentId, el)}
                  role="row"
                  tabIndex={focused ? 0 : -1}
                  className={`install-row${selected ? ' selected' : ''}${atCursor ? ' install-cursor' : ''}${atCursor && cursorLive ? ' install-cursor-live' : ''}${hasBreakpoint ? ' install-breakpoint' : ''}${rowHover ? ' row-hover' : ''}${focused ? ' focused' : ''} install-status-${row.status}`}
                  onClick={() => selectRow(row.stepId, row.componentId)}
                  onMouseEnter={() => setHoveredStepId(row.stepId)}
                  onContextMenu={(e) => {
                    if (!step || stepIndex < 0 || !tableActions) return
                    e.preventDefault()
                    selectRow(row.stepId, row.componentId)
                    setContextMenu({ stepId: row.stepId, x: e.clientX, y: e.clientY })
                  }}
                >
                  <td className="install-col-num">{row.order}</td>
                  <TipCell
                    className="install-col-mod"
                    display={modDisplay}
                    tip={modTip}
                  />
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
                    <span className="mods-cell-clip">{category || '—'}</span>
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
                  <td className="install-col-actions">
                    {tableActions && step && stepIndex >= 0 ? (
                      <StepActionButtons
                        step={step}
                        stepIndex={stepIndex}
                        actions={tableActions}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {contextMenu && tableActions ? (() => {
        const step = stepById.get(contextMenu.stepId)
        const stepIndex = stepIndexById(steps, contextMenu.stepId)
        if (!step || stepIndex < 0) return null
        return (
          <InstallStepContextMenu
            menu={contextMenu}
            step={step}
            stepIndex={stepIndex}
            actions={tableActions}
            onClose={() => setContextMenu(null)}
          />
        )
      })() : null}
    </div>
  )
}
