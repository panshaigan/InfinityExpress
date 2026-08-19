import {
  memo,
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
import { canSetBreakpoint, isStepDone } from '../../lib/install/cursor'
import { isStepDurationLive, stepDurationLabel } from '../../lib/install/formatDuration'
import type {
  InstallRunState,
  InstallStep,
  PlannedSnapshot,
  StepProgress,
} from '../../lib/install/types'
import { expandStepsToTableRows } from '../../lib/install/planBuilder'
import {
  effectiveModFields,
  type WorkingMod,
} from '../../lib/mods/loadMods'
import {
  gameFolderKeyForPhase,
  gameFolderKeyLabel,
} from '../../lib/ui/gameFolderPrefs'
import type { InstallSequenceModel, SelectedGame } from '../../lib/xml/schema'
import { IconTip } from '../IconTip'
import {
  BreakpointIcon,
  MoveCursorIcon,
  RemoveFromPlanIcon,
  SnapshotIcon,
  UninstallBackIcon,
} from './InstallControlIcons'
import { canRemoveStepFromPlan, type InstallLock } from '../../lib/install/installLock'

export const INSTALL_TABLE_ID = 'install-table'
const INSTALL_ROW_HEIGHT_ESTIMATE = 42
const INSTALL_ROW_OVERSCAN = 14

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
  const snapshotting = !!progress?.label?.startsWith('Snapshotting')
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
        {snapshotting ? 'Snapshot' : STATUS_LABEL[status]}
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
  plannedSnapshots: PlannedSnapshot[]
  game: SelectedGame | null
  canNavigate: boolean
  installLock: InstallLock
  onRequestUninstallBack: (stepId: string) => void
  onToggleBreakpoint: (stepId: string) => void
  onRequestPlanSnapshot: (stepId: string) => void
  onClearPlannedSnapshot: (stepId: string) => void
  onRequestMoveCursor: (stepId: string) => void
  onRemoveFromPlan: (stepId: string) => void
}

interface ContextMenuState {
  stepId: string
  x: number
  y: number
}

function plannedForStep(
  plannedSnapshots: PlannedSnapshot[],
  stepId: string,
): PlannedSnapshot | undefined {
  return plannedSnapshots.find((s) => s.stepId === stepId)
}

function snapshotGameLabel(game: SelectedGame | null, step: InstallStep): string {
  if (!game) return 'game'
  return gameFolderKeyLabel(gameFolderKeyForPhase(game, step.phase))
}

function createStepIndexMap(steps: InstallStep[]): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < steps.length; i += 1) {
    map.set(steps[i]!.stepId, i)
  }
  return map
}

function createStepIdSet(ids: string[]): Set<string> {
  const set = new Set<string>()
  for (const id of ids) set.add(id)
  return set
}

type InstallRowViewModel = ReturnType<typeof expandStepsToTableRows>[number] & {
  step: InstallStep | undefined
  stepIndex: number
  hasBreakpoint: boolean
  hasSnapshot: boolean
  modDisplay: string
  modTip: string
  componentNameTip?: string
  category: string
  complexity: string
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
  const planned = plannedForStep(actions.plannedSnapshots, step.stepId)
  const hasSnapshot = !!planned
  const snapshotLabel = snapshotGameLabel(actions.game, step)
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
        disabled={!canBreakpoint}
        onClick={() =>
          run(() =>
            hasSnapshot
              ? actions.onClearPlannedSnapshot(step.stepId)
              : actions.onRequestPlanSnapshot(step.stepId),
          )
        }
      >
        <SnapshotIcon active={hasSnapshot} />
        <span>
          {hasSnapshot
            ? 'Remove planned snapshot'
            : `Plan snapshot (${snapshotLabel})`}
        </span>
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
  const planned = plannedForStep(actions.plannedSnapshots, step.stepId)
  const hasSnapshot = !!planned
  const snapshotLabel = snapshotGameLabel(actions.game, step)
  const snapshotTip = hasSnapshot
    ? planned.name
      ? `Remove planned snapshot (${planned.name})`
      : 'Remove planned snapshot'
    : `Plan snapshot (${snapshotLabel})`
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
          className={`install-row-action-btn${hasSnapshot ? ' snapshot-active' : ''}`}
          disabled={!canBreakpoint}
          aria-label={snapshotTip}
          aria-pressed={hasSnapshot}
          onClick={() =>
            hasSnapshot
              ? actions.onClearPlannedSnapshot(step.stepId)
              : actions.onRequestPlanSnapshot(step.stepId)
          }
        >
          <SnapshotIcon active={hasSnapshot} />
        </button>
        <IconTip>{snapshotTip}</IconTip>
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

const StepActionButtonsMemo = memo(StepActionButtons)

function DurationCell({
  step,
  runState,
}: {
  step: InstallStep | undefined
  runState: InstallRunState | null
}) {
  const live = !!step && isStepDurationLive(step, runState)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!live) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [live])

  if (!step) return <span className="mods-cell-clip">-</span>
  return <span className="mods-cell-clip">{stepDurationLabel(step, nowMs, runState)}</span>
}

const DurationCellMemo = memo(DurationCell)

interface InstallTableRowProps {
  row: InstallRowViewModel
  selectedStepId: string | null
  selectedComponentId: string | null
  cursorStepId: string | null
  cursorLive: boolean
  runState: InstallRunState | null
  tableActions: InstallTableActions | null
  setRowEl: (stepId: string, componentId: string, el: HTMLTableRowElement | null) => void
  onSelect: (stepId: string, componentId: string) => void
  onOpenContextMenu: (stepId: string, x: number, y: number) => void
}

function InstallTableRow({
  row,
  selectedStepId,
  selectedComponentId,
  cursorStepId,
  cursorLive,
  runState,
  tableActions,
  setRowEl,
  onSelect,
  onOpenContextMenu,
}: InstallTableRowProps) {
  const selected = row.stepId === selectedStepId
  const atCursor = row.stepId === cursorStepId
  const focused = selected && row.componentId === selectedComponentId

  return (
    <tr
      key={row.stepId}
      ref={(el) => setRowEl(row.stepId, row.componentId, el)}
      role="row"
      tabIndex={focused ? 0 : -1}
      className={`install-row${selected ? ' selected' : ''}${atCursor ? ' install-cursor' : ''}${atCursor && cursorLive ? ' install-cursor-live' : ''}${row.hasBreakpoint ? ' install-breakpoint' : ''}${row.hasSnapshot ? ' install-snapshot' : ''}${focused ? ' focused' : ''} install-status-${row.status}`}
      onClick={() => onSelect(row.stepId, row.componentId)}
      onContextMenu={(e) => {
        if (!row.step || row.stepIndex < 0 || !tableActions) return
        e.preventDefault()
        onSelect(row.stepId, row.componentId)
        onOpenContextMenu(row.stepId, e.clientX, e.clientY)
      }}
    >
      <td className="install-col-num">{row.order}</td>
      <TipCell className="install-col-mod" display={row.modDisplay} tip={row.modTip} />
      <TipCell
        className="install-col-component"
        display={row.componentLabel}
        tip={row.componentNameTip}
      />
      <td className="install-col-component-id has-icon-tip">
        <span className="install-id-cell">
          <span className="mods-cell-clip">{row.componentId}</span>
          <IdCopyButton value={row.componentId} />
        </span>
        <IconTip>{row.componentId}</IconTip>
      </td>
      <td className="install-col-category">
        <span className="mods-cell-clip">{row.category || '—'}</span>
      </td>
      <td className="install-col-type">
        <span className="mods-cell-clip">{row.complexity || '—'}</span>
      </td>
      <td className="install-col-duration">
        <DurationCellMemo step={row.step} runState={runState} />
      </td>
      <td className="install-col-status">
        <StatusCell status={row.status} progress={row.step?.progress} />
      </td>
      <td className="install-col-actions">
        {tableActions && row.step && row.stepIndex >= 0 ? (
          <StepActionButtonsMemo
            step={row.step}
            stepIndex={row.stepIndex}
            actions={tableActions}
          />
        ) : null}
      </td>
    </tr>
  )
}

const InstallTableRowMemo = memo(InstallTableRow)

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
  const profileInstallTable =
    import.meta.env.DEV && (window as Window & { __IX_PROFILE_INSTALL?: boolean }).__IX_PROFILE_INSTALL === true
  const rows = useMemo(() => expandStepsToTableRows(steps), [steps])
  const stepById = useMemo(() => {
    const map = new Map<string, InstallStep>()
    for (const s of steps) map.set(s.stepId, s)
    return map
  }, [steps])
  const stepIndexMap = useMemo(() => createStepIndexMap(steps), [steps])
  const modsByCodename = useMemo(() => {
    const map = new Map<string, WorkingMod>()
    for (const m of mods) map.set(m.codename.toLowerCase(), m)
    return map
  }, [mods])
  const componentMetaById = useMemo(() => {
    const map = new Map<
      string,
      { weiduName?: string; complexity: string }
    >()
    for (const [componentId, component] of model.componentsById.entries()) {
      map.set(componentId, {
        weiduName: component.attrs.name?.trim() || undefined,
        complexity: component.attrs.complexity?.trim() || '',
      })
    }
    return map
  }, [model.componentsById])
  const breakpointStepIdSet = useMemo(
    () => createStepIdSet(tableActions?.breakpointStepIds ?? []),
    [tableActions?.breakpointStepIds],
  )
  const plannedSnapshotByStepId = useMemo(() => {
    const map = new Map<string, PlannedSnapshot>()
    for (const snapshot of tableActions?.plannedSnapshots ?? []) {
      map.set(snapshot.stepId, snapshot)
    }
    return map
  }, [tableActions?.plannedSnapshots])
  const visible = useMemo(
    () =>
      hideInstalled
        ? rows.filter(
            (r) => r.status !== 'succeeded' && r.status !== 'alreadyInstalled',
          )
        : rows,
    [rows, hideInstalled],
  )
  const visibleIndexByRowKey = useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 0; i < visible.length; i += 1) {
      const row = visible[i]!
      map.set(`${row.stepId}\0${row.componentId}`, i)
    }
    return map
  }, [visible])

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [rowHeight, setRowHeight] = useState(INSTALL_ROW_HEIGHT_ESTIMATE)
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEndExclusive, setRangeEndExclusive] = useState(0)
  const scrollWrapRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const rangeRef = useRef({ start: 0, end: 0 })
  const pendingFocusKeyRef = useRef<string | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const syncedSelectionKeyRef = useRef<string | null>(null)
  const visibleRows = useMemo(() => {
    const t0 = profileInstallTable ? performance.now() : 0
    const built = visible.map((row) => {
      const step = stepById.get(row.stepId)
      const stepIndex = stepIndexMap.get(row.stepId) ?? -1
      const mod = modsByCodename.get(row.modId.toLowerCase())
      const eff = mod ? effectiveModFields(mod) : null
      const componentMeta = componentMetaById.get(row.componentId)
      return {
        ...row,
        step,
        stepIndex,
        hasBreakpoint: step != null && breakpointStepIdSet.has(row.stepId),
        hasSnapshot: step != null && plannedSnapshotByStepId.has(row.stepId),
        modDisplay: eff?.name?.trim() || row.modId,
        modTip: mod?.codename ?? row.modId,
        componentNameTip: componentMeta?.weiduName,
        category: eff?.category?.trim() || '',
        complexity: componentMeta?.complexity || '',
      }
    })
    if (profileInstallTable) {
      const elapsed = performance.now() - t0
      if (elapsed > 8) {
        console.debug('[install-perf] build visibleRows ms=', elapsed.toFixed(1), 'rows=', built.length)
      }
    }
    return built
  }, [
    breakpointStepIdSet,
    componentMetaById,
    modsByCodename,
    plannedSnapshotByStepId,
    profileInstallTable,
    stepById,
    stepIndexMap,
    visible,
  ])

  const rowKey = useCallback(
    (stepId: string, componentId: string) => `${stepId}\0${componentId}`,
    [],
  )

  const focusPendingRow = useCallback(() => {
    const key = pendingFocusKeyRef.current
    if (!key) return
    const el = rowRefs.current.get(key)
    if (!el) return
    if (document.activeElement !== el) el.focus()
    pendingFocusKeyRef.current = null
  }, [])

  const applyRange = useCallback(
    (nextStart: number, nextEndExclusive: number) => {
      const boundedStart = Math.max(0, Math.min(nextStart, visibleRows.length))
      const boundedEnd = Math.max(boundedStart, Math.min(nextEndExclusive, visibleRows.length))
      const prev = rangeRef.current
      if (prev.start === boundedStart && prev.end === boundedEnd) return
      rangeRef.current = { start: boundedStart, end: boundedEnd }
      setRangeStart(boundedStart)
      setRangeEndExclusive(boundedEnd)
    },
    [visibleRows.length],
  )

  const updateRangeForScroll = useCallback(
    (scrollTop: number, viewportHeight: number) => {
      const rowsCount = visibleRows.length
      if (rowsCount === 0) {
        applyRange(0, 0)
        return
      }
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - INSTALL_ROW_OVERSCAN)
      const visibleCount = Math.ceil(viewportHeight / rowHeight)
      const end = Math.min(
        rowsCount,
        start + visibleCount + INSTALL_ROW_OVERSCAN * 2,
      )
      applyRange(start, end)
    },
    [applyRange, rowHeight, visibleRows.length],
  )

  const updateRangeFromContainer = useCallback(() => {
    const container = scrollWrapRef.current
    if (!container) {
      applyRange(0, Math.min(visibleRows.length, INSTALL_ROW_OVERSCAN * 4))
      return
    }
    updateRangeForScroll(container.scrollTop, container.clientHeight)
  }, [applyRange, updateRangeForScroll, visibleRows.length])

  const scrollToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, Math.max(0, visibleRows.length - 1)))
      const container = scrollWrapRef.current
      if (!container) return
      const rowTop = clamped * rowHeight
      const rowBottom = rowTop + rowHeight
      const viewTop = container.scrollTop
      const viewBottom = viewTop + container.clientHeight
      if (rowTop < viewTop) {
        container.scrollTop = rowTop
      } else if (rowBottom > viewBottom) {
        container.scrollTop = Math.max(0, rowBottom - container.clientHeight)
      }
      updateRangeForScroll(container.scrollTop, container.clientHeight)
    },
    [rowHeight, updateRangeForScroll, visibleRows.length],
  )

  const scheduleRangeRefresh = useCallback(() => {
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      updateRangeFromContainer()
    })
  }, [updateRangeFromContainer])

  const setRowEl = useCallback(
    (stepId: string, componentId: string, el: HTMLTableRowElement | null) => {
      const key = rowKey(stepId, componentId)
      if (el) rowRefs.current.set(key, el)
      else rowRefs.current.delete(key)
    },
    [],
  )

  useEffect(() => {
    updateRangeFromContainer()
  }, [updateRangeFromContainer])

  useEffect(() => {
    focusPendingRow()
  }, [focusPendingRow, rangeStart, rangeEndExclusive])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
    }
  }, [])

  const selectIndex = useCallback(
    (index: number) => {
      const bounded = Math.max(0, Math.min(index, visibleRows.length - 1))
      const row = visibleRows[bounded]
      if (!row) return
      scrollToIndex(bounded)
      pendingFocusKeyRef.current = rowKey(row.stepId, row.componentId)
      onSelectStep(row.stepId, row.componentId)
      requestAnimationFrame(() => focusPendingRow())
    },
    [focusPendingRow, onSelectStep, rowKey, scrollToIndex, visibleRows],
  )

  const selectRow = useCallback(
    (stepId: string, componentId: string) => {
      pendingFocusKeyRef.current = rowKey(stepId, componentId)
      onSelectStep(stepId, componentId)
      requestAnimationFrame(() => focusPendingRow())
    },
    [focusPendingRow, onSelectStep, rowKey],
  )

  useEffect(() => {
    if (!selectedStepId || !selectedComponentId) {
      syncedSelectionKeyRef.current = null
      return
    }
    const key = rowKey(selectedStepId, selectedComponentId)
    if (syncedSelectionKeyRef.current === key) return
    syncedSelectionKeyRef.current = key
    const selectedIndex = visibleIndexByRowKey.get(key)
    if (selectedIndex == null) return
    pendingFocusKeyRef.current = key
    scrollToIndex(selectedIndex)
    requestAnimationFrame(() => focusPendingRow())
  }, [focusPendingRow, rowKey, scrollToIndex, selectedComponentId, selectedStepId, visibleIndexByRowKey])

  const renderedRows = useMemo(
    () => visibleRows.slice(rangeStart, rangeEndExclusive),
    [rangeEndExclusive, rangeStart, visibleRows],
  )
  const spacerTop = rangeStart * rowHeight
  const spacerBottom = Math.max(0, (visibleRows.length - rangeEndExclusive) * rowHeight)

  useEffect(() => {
    const first = renderedRows[0]
    if (!first) return
    const el = rowRefs.current.get(rowKey(first.stepId, first.componentId))
    if (!el) return
    const measured = Math.round(el.getBoundingClientRect().height)
    if (!Number.isFinite(measured) || measured <= 0) return
    if (Math.abs(measured - rowHeight) < 1) return
    setRowHeight(measured)
  }, [renderedRows, rowHeight])

  function handleTableKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (visible.length === 0) return
    const current =
      selectedStepId && selectedComponentId
        ? (visibleIndexByRowKey.get(rowKey(selectedStepId, selectedComponentId)) ?? -1)
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
        tabIndex={visibleRows.length === 0 ? 0 : -1}
        ref={scrollWrapRef}
        onScroll={scheduleRangeRefresh}
        onKeyDown={handleTableKeyDown}
        onFocus={() => {
          if ((!selectedStepId || !selectedComponentId) && visibleRows[0]) {
            onSelectStep(visibleRows[0].stepId, visibleRows[0].componentId)
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
              <th scope="col">Complexity</th>
              <th scope="col">Duration</th>
              <th scope="col">Status</th>
              <th scope="col" className="install-col-actions-head">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {spacerTop > 0 ? (
              <tr aria-hidden="true">
                <td
                  colSpan={9}
                  style={{
                    height: `${spacerTop}px`,
                    padding: 0,
                    borderBottom: 'none',
                    pointerEvents: 'none',
                  }}
                />
              </tr>
            ) : null}
            {renderedRows.map((row) => (
              <InstallTableRowMemo
                key={row.stepId}
                row={row}
                selectedStepId={selectedStepId}
                selectedComponentId={selectedComponentId}
                cursorStepId={cursorStepId}
                cursorLive={cursorLive}
                runState={runState}
                tableActions={tableActions}
                setRowEl={setRowEl}
                onSelect={selectRow}
                onOpenContextMenu={(stepId, x, y) =>
                  setContextMenu({ stepId, x, y })
                }
              />
            ))}
            {spacerBottom > 0 ? (
              <tr aria-hidden="true">
                <td
                  colSpan={9}
                  style={{
                    height: `${spacerBottom}px`,
                    padding: 0,
                    borderBottom: 'none',
                    pointerEvents: 'none',
                  }}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {contextMenu && tableActions ? (() => {
        const step = stepById.get(contextMenu.stepId)
        const stepIndex = stepIndexMap.get(contextMenu.stepId) ?? -1
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
