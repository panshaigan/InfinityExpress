import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useInstallRun } from '../../hooks/useInstallRun'
import { formatPlayerDurationMs } from '../../lib/install/formatDuration'
import { nextActionableCursor, stepIndexById } from '../../lib/install/cursor'
import { collectadjustmentsModIds } from '../../lib/install/weiduResolution'
import {
  cleanupInstallArtifacts,
  createNamedBackup,
  gameDirForPhase,
  listBackups,
  listenBackupProgress,
  restoreGameDir,
  type BackupProgress,
} from '../../lib/desktop/weiduInstall'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'
import type { WorkingMod } from '../../lib/mods/loadMods'
import { readAppDirPaths } from '../../lib/ui/appDirPrefs'
import {
  gameFolderKeyForPhase,
  gameFolderKeyLabel,
  type GameFolderPaths,
} from '../../lib/ui/gameFolderPrefs'
import {
  getMissingInstallPaths,
  type MissingInstallPath,
} from '../../lib/ui/installPathValidation'
import { PATHS_CHANGED_EVENT } from '../../lib/ui/pathPrefsEvents'
import { readWeiduPath } from '../../lib/ui/weiduPrefs'
import type { WeiduLogImportResult } from '../../lib/install/weiduLogMap'
import type { InstallSequenceModel, SelectedGame } from '../../lib/xml/schema'
import { RestoreSnapshotDialog } from './RestoreSnapshotDialog'
import { PlanSnapshotDialog } from './PlanSnapshotDialog'
import { RestartConfirmDialog, type RestartScope } from './RestartConfirmDialog'
import { ConfirmDialog } from '../ConfirmDialog'
import { InstallConsoleDock } from './InstallConsoleDock'
import { InstallDetailPane } from './InstallDetailPane'
import { InstallTable } from './InstallTable'
import {
  HideInstalledIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  RestoreSnapshotIcon,
  SkipNextIcon,
  SkipPreviousIcon,
  SnapshotIcon,
  StopIcon,
} from './InstallControlIcons'
import { IconTip } from '../IconTip'
import { useToast } from '../toasts/toastContext'
import {
  hasVanillaForKey,
  missingVanillaKeys,
  readVanillaRegistry,
  setVanillaBinding,
} from '../../lib/projects'
import {
  buildPersistedInstallSession,
  type PersistedInstallSession,
} from '../../lib/ui/appSessionPrefs'
import {
  deriveInstallLock,
  hasInstallStarted,
  type InstallLock,
} from '../../lib/install/installLock'
import { defaultSnapshotName } from '../../lib/install/snapshotName'

export type InstallActions = {
  performVanillaRestart: (scope: RestartScope) => Promise<boolean>
}

interface Props {
  model: InstallSequenceModel
  selectedIds: ReadonlySet<string>
  game: SelectedGame | null
  neededCodenames: string[]
  mods: WorkingMod[]
  detailCollapsed: boolean
  detailWidth: number
  onDetailWidthChange: (width: number) => void
  onToggleDetailCollapsed: () => void
  onOpenSettings: () => void
  onOpenSettingsForMissing: (missing: MissingInstallPath[]) => void
  onBusyChange?: (busy: boolean) => void
  onExitBlockingChange?: (busy: boolean) => void
  /** Per-project live game destinations. */
  gameFolders: GameFolderPaths
  projectId?: string | null
  initialInstallSession?: PersistedInstallSession
  onInstallSessionChange?: (session: PersistedInstallSession | null) => void
  onDeselectComponent?: (componentId: string) => void
  installLock?: InstallLock
  onInstallActionsReady?: (actions: InstallActions | null) => void
  weiduLogImport?: WeiduLogImportResult | null
}

function allModsPresent(needed: string[], mods: WorkingMod[]): boolean {
  const map = new Map(mods.map((m) => [m.codename.toLowerCase(), m]))
  return needed.every((c) => {
    const m = map.get(c.toLowerCase())
    return m != null && m.diskStatus !== 'not_present'
  })
}

export function InstallStation({
  model,
  selectedIds,
  game,
  neededCodenames,
  mods,
  detailCollapsed,
  detailWidth,
  onDetailWidthChange,
  onToggleDetailCollapsed,
  onOpenSettings,
  onOpenSettingsForMissing,
  onBusyChange,
  onExitBlockingChange,
  gameFolders,
  projectId = null,
  initialInstallSession,
  onInstallSessionChange,
  onDeselectComponent,
  installLock: installLockProp,
  onInstallActionsReady,
  weiduLogImport = null,
}: Props) {
  const profileInstallTable =
    import.meta.env.DEV && (window as Window & { __IX_PROFILE_INSTALL?: boolean }).__IX_PROFILE_INSTALL === true
  const { pushToast } = useToast()
  const followCursorForDetailsRef = useRef(true)
  const [clearedDurationMsTotal, setClearedDurationMsTotal] = useState(0)
  const [pathTick, setPathTick] = useState(0)
  const appDirs = readAppDirPaths()
  const weiduPath = readWeiduPath()
  void pathTick

  const adjustmentsModIds = useMemo(
    () => collectadjustmentsModIds(model),
    [model],
  )

  const {
    run,
    planSteps,
    consoleLines,
    commandLines,
    resultLines,
    inputPrompt,
    cursorStepId,
    initRun,
    start,
    continueRun,
    pause,
    stop,
    skipCurrent,
    goToPreviousStep,
    uninstallBackToStep,
    toggleBreakpoint,
    setPlannedSnapshot,
    clearPlannedSnapshot,
    plannedSnapshotBusy,
    moveCursorToStep,
    canGoPrevious,
    canSkip,
    restartFromBackup,
    stopRunningInstall,
    sendInput,
    appendCommandLine,
    pausePending,
    paused,
    stopping,
    skipping,
    goingPrevious,
  } = useInstallRun({
    model,
    selectedIds,
    game,
    gameFolders,
    projectId,
    initialInstallState: initialInstallSession
      ? { installSession: initialInstallSession }
      : null,
    weiduLogImport,
    onDurationClearedMs: (deltaMs) => {
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) return
      setClearedDurationMsTotal((prev) => prev + Math.max(0, Math.floor(deltaMs)))
    },
  })

  const installLock = useMemo(
    () => installLockProp ?? deriveInstallLock(run),
    [installLockProp, run],
  )

  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    () => initialInstallSession?.ui.selectedStepId ?? null,
  )
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(
    () => initialInstallSession?.ui.selectedComponentId ?? null,
  )
  const [hideInstalled, setHideInstalled] = useState(
    () => initialInstallSession?.ui.hideInstalled ?? false,
  )
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [snapshotBusy, setSnapshotBusy] = useState(false)
  const [snapshotCount, setSnapshotCount] = useState(0)
  const [snapshotListTick, setSnapshotListTick] = useState(0)
  const [takeSnapshotDialog, setTakeSnapshotDialog] = useState<{
    gameKey: string
    sourceDir: string
    name: string
  } | null>(null)
  const [takeProgress, setTakeProgress] = useState<BackupProgress | null>(null)
  const [takeError, setTakeError] = useState<string | null>(null)
  const [planSnapshotDialog, setPlanSnapshotDialog] = useState<{
    stepId: string
    gameKey: string
    name: string
  } | null>(null)
  const [restartDialogOpen, setRestartDialogOpen] = useState(false)
  const [cleanupOffer, setCleanupOffer] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger?: boolean
    onConfirm: () => void
  } | null>(null)
  const [runElapsedMs, setRunElapsedMs] = useState(
    () => initialInstallSession?.ui.runElapsedMs ?? 0,
  )
  const prevRunStateRef = useRef(run?.runState ?? null)
  const promptedMissingPathsRef = useRef(false)
  const runElapsedAccumRef = useRef(initialInstallSession?.ui.runElapsedMs ?? 0)
  const runSegmentStartRef = useRef<number | null>(null)
  const timedRunIdRef = useRef<string | null>(null)
  const restoredRunIdRef = useRef(initialInstallSession?.run.runId ?? null)
  const restoredElapsedRef = useRef(initialInstallSession?.ui.runElapsedMs ?? 0)
  const processedClearedDurationRef = useRef(0)
  const lastPersistedSessionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!onInstallSessionChange || !game || !run || run.runState === 'idle') {
      lastPersistedSessionKeyRef.current = null
      onInstallSessionChange?.(null)
      return
    }
    const sampledElapsedMs = Math.max(0, Math.floor(runElapsedMs / 1000) * 1000)
    const nextSession = buildPersistedInstallSession({
      game,
      selectedIds,
      run,
      paused,
      selectedStepId,
      selectedComponentId,
      hideInstalled,
      runElapsedMs: sampledElapsedMs,
    })
    const nextKey = JSON.stringify(nextSession)
    if (lastPersistedSessionKeyRef.current === nextKey) return
    lastPersistedSessionKeyRef.current = nextKey
    onInstallSessionChange(nextSession)
  }, [
    game,
    hideInstalled,
    onInstallSessionChange,
    paused,
    run,
    runElapsedMs,
    selectedComponentId,
    selectedIds,
    selectedStepId,
  ])

  const steps = run?.steps ?? planSteps

  const selectedStep = useMemo(
    () => steps.find((s) => s.stepId === selectedStepId) ?? steps[0] ?? null,
    [steps, selectedStepId],
  )

  useEffect(() => {
    if (cursorStepId && followCursorForDetailsRef.current) {
      setSelectedStepId(cursorStepId)
      const active = steps.find((s) => s.stepId === cursorStepId)
      if (active?.componentId) {
        setSelectedComponentId((prev) =>
          prev === active.componentId ? prev : active.componentId,
        )
      }
      return
    }
    if (!selectedStepId && steps[0]) {
      setSelectedStepId(steps[0].stepId)
      setSelectedComponentId(steps[0].componentId)
    }
  }, [steps, selectedStepId, cursorStepId])

  useEffect(() => {
    const delta = clearedDurationMsTotal - processedClearedDurationRef.current
    if (delta <= 0) return
    processedClearedDurationRef.current = clearedDurationMsTotal
    runElapsedAccumRef.current = Math.max(0, runElapsedAccumRef.current - delta)
    setRunElapsedMs((prev) => Math.max(0, prev - delta))
  }, [clearedDurationMsTotal])

  useEffect(() => {
    if (run?.runState === 'completed') setCleanupOffer(true)
  }, [run?.runState])

  useEffect(() => {
    const next = run?.runState ?? null
    const prev = prevRunStateRef.current
    if (next === prev) return
    prevRunStateRef.current = next
    if (next === 'completed') {
      pushToast({ tone: 'success', message: 'Install completed.' })
    } else if (next === 'failed') {
      pushToast({ tone: 'error', message: 'Install failed.' })
    } else if (next === 'waitingForInput') {
      pushToast({ tone: 'success', message: 'Install needs your input.' })
    }
  }, [run?.runState, pushToast])

  useEffect(() => {
    onBusyChange?.(run?.runState === 'running' || snapshotBusy || plannedSnapshotBusy)
    return () => onBusyChange?.(false)
  }, [run?.runState, snapshotBusy, plannedSnapshotBusy, onBusyChange])

  useEffect(() => {
    const installExitBlocking =
      run?.runState === 'running' ||
      run?.runState === 'waitingForInput' ||
      stopping ||
      skipping ||
      goingPrevious ||
      snapshotBusy ||
      plannedSnapshotBusy
    onExitBlockingChange?.(installExitBlocking)
    return () => onExitBlockingChange?.(false)
  }, [
    run?.runState,
    stopping,
    skipping,
    goingPrevious,
    snapshotBusy,
    plannedSnapshotBusy,
    onExitBlockingChange,
  ])

  const runId = run?.runId ?? null
  const runState = run?.runState ?? null
  const isRunTiming =
    runState === 'running' || runState === 'waitingForInput'

  useEffect(() => {
    if (runId !== timedRunIdRef.current) {
      timedRunIdRef.current = runId
      processedClearedDurationRef.current = 0
      setClearedDurationMsTotal(0)
      if (runId && runId === restoredRunIdRef.current) {
        runElapsedAccumRef.current = restoredElapsedRef.current
        setRunElapsedMs(restoredElapsedRef.current)
      } else {
        runElapsedAccumRef.current = 0
        runSegmentStartRef.current = null
        setRunElapsedMs(0)
      }
    }

    if (!runId || runState == null || runState === 'idle') {
      runElapsedAccumRef.current = 0
      runSegmentStartRef.current = null
      setRunElapsedMs(0)
      return
    }

    if (isRunTiming) {
      if (runSegmentStartRef.current == null) {
        runSegmentStartRef.current = Date.now()
      }
      return
    }

    // Pause / stop / failed / completed: freeze elapsed.
    if (runSegmentStartRef.current != null) {
      runElapsedAccumRef.current += Date.now() - runSegmentStartRef.current
      runSegmentStartRef.current = null
      setRunElapsedMs(runElapsedAccumRef.current)
    }
  }, [runId, runState, isRunTiming])

  useEffect(() => {
    if (!isRunTiming) return
    const tick = () => {
      const segment = runSegmentStartRef.current
      const live =
        runElapsedAccumRef.current + (segment != null ? Date.now() - segment : 0)
      setRunElapsedMs(live)
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [isRunTiming])

  useEffect(() => {
    function maybePromptMissingPaths() {
      if (!isDesktopApp() || !game) return
      const missing = getMissingInstallPaths(game, gameFolders)
      if (missing.length === 0) {
        promptedMissingPathsRef.current = false
        return
      }
      if (promptedMissingPathsRef.current) return
      promptedMissingPathsRef.current = true
      onOpenSettingsForMissing(missing)
    }
    maybePromptMissingPaths()
    function onPathsChanged() {
      setPathTick((n) => n + 1)
      maybePromptMissingPaths()
    }
    window.addEventListener(PATHS_CHANGED_EVENT, onPathsChanged)
    return () => window.removeEventListener(PATHS_CHANGED_EVENT, onPathsChanged)
  }, [game, gameFolders, onOpenSettingsForMissing])

  const modsReady = allModsPresent(neededCodenames, mods)
  const canRun = isDesktopApp() && !!game && modsReady && !!weiduPath && !!appDirs.backupDir
  const canSnapshot = !!game && !!appDirs.backupDir
  const vanillaRegistry = readVanillaRegistry()
  const missingVanillas = game ? missingVanillaKeys(game, vanillaRegistry) : []
  const isRunning = run?.runState === 'running'
  const installLive =
    run?.runState === 'running' || run?.runState === 'waitingForInput'
  const transportBusy = stopping || skipping || goingPrevious || plannedSnapshotBusy
  const installStarted = hasInstallStarted(run)
  const snapshotTarget = useMemo(() => {
    if (!game) return null
    const step = run?.steps[run.cursor] ?? run?.steps[0]
    const phase = step?.phase ?? 'single'
    return {
      gameKey: gameFolderKeyForPhase(game, phase),
      sourceDir: gameDirForPhase(game, phase, gameFolders),
    }
  }, [game, run, gameFolders])
  const takeVanillaMissing =
    snapshotTarget != null && !hasVanillaForKey(vanillaRegistry, snapshotTarget.gameKey)
  const snapshotActionBusy = snapshotBusy || plannedSnapshotBusy || transportBusy
  const canRestart =
    canSnapshot &&
    missingVanillas.length === 0 &&
    !snapshotActionBusy &&
    installStarted
  const restartTip =
    missingVanillas.length > 0
      ? 'Set vanilla backup in Settings'
      : !installStarted
        ? 'Start installation first'
        : 'Restart from vanilla backup'
  const canTakeSnapshot =
    canSnapshot &&
    !!snapshotTarget?.sourceDir &&
    !takeVanillaMissing &&
    !snapshotActionBusy &&
    !installLive
  const takeTip = takeVanillaMissing
    ? 'Set vanilla backup in Settings'
    : installLive
      ? 'Pause or stop installation first'
      : snapshotActionBusy
        ? 'Snapshot in progress'
        : !snapshotTarget?.sourceDir
          ? 'Set game folder in Settings'
          : 'Take a snapshot'
  const canRestoreSnapshot =
    canSnapshot &&
    snapshotCount > 0 &&
    !snapshotActionBusy &&
    !installLive
  const restoreTip =
    snapshotCount === 0
      ? 'No snapshots yet'
      : installLive
        ? 'Pause or stop installation first'
        : snapshotActionBusy
          ? 'Snapshot in progress'
          : 'Restore snapshot'
  const canPauseToggle =
    !!run &&
    !transportBusy &&
    (run.runState === 'running' || run.runState === 'paused')
  const canStop =
    !!run &&
    !transportBusy &&
    (run.runState === 'running' || run.runState === 'waitingForInput')
  const canSkipEffective = canSkip && !transportBusy
  const resumeFromCursor =
    !!run &&
    (run.runState === 'paused' ||
      run.runState === 'stopped' ||
      run.runState === 'failed' ||
      run.runState === 'waitingForInput')
  const canGoPreviousEffective = canGoPrevious && !transportBusy

  const canNavigateSteps =
    !!run && (run.runState === 'paused' || run.runState === 'stopped')

  const requestGoPrevious = useCallback(() => {
    setConfirmDialog({
      title: 'Go to previous step?',
      message:
        'Move the cursor back one install step and uninstall that package so you can install it again.',
      confirmLabel: 'Go back',
      danger: true,
      onConfirm: () => {
        setConfirmDialog(null)
        void goToPreviousStep()
      },
    })
  }, [goToPreviousStep])

  const tableActions = useMemo(() => {
    if (planSteps.length === 0) return null
    const tableRun = run
    const tableRunState = tableRun?.runState ?? 'idle'
    const tableCursor = tableRun?.cursor ?? nextActionableCursor(steps, 0)
    const tableSteps = tableRun?.steps ?? steps
    const tableBreakpoints = tableRun?.breakpointStepIds ?? []
    const tableSnapshots = tableRun?.plannedSnapshots ?? []
    return {
      runState: tableRunState,
      cursor: tableCursor,
      breakpointStepIds: tableBreakpoints,
      plannedSnapshots: tableSnapshots,
      game,
      canNavigate: canNavigateSteps,
      canGoPrevious: canGoPreviousEffective,
      canSkip: canSkipEffective,
      installLock,
      onRequestGoPrevious: requestGoPrevious,
      onSkip: () => {
        skipCurrent()
      },
      onRequestUninstallBack: (stepId: string) => {
        if (!tableRun) return
        const step = tableRun.steps.find((s) => s.stepId === stepId)
        const label = step?.modId ?? 'this step'
        setConfirmDialog({
          title: 'Uninstall back to step?',
          message: `Uninstall packages from the cursor back to ${label}. This rolls back WeiDU components step by step.`,
          confirmLabel: 'Uninstall',
          danger: true,
          onConfirm: () => {
            setConfirmDialog(null)
            void uninstallBackToStep(stepId)
          },
        })
      },
      onToggleBreakpoint: (stepId: string) => {
        toggleBreakpoint(stepId)
      },
      onRequestPlanSnapshot: (stepId: string) => {
        const step = tableSteps.find((s) => s.stepId === stepId)
        if (!step || !game) return
        setPlanSnapshotDialog({
          stepId,
          gameKey: gameFolderKeyForPhase(game, step.phase),
          name: defaultSnapshotName(),
        })
      },
      onClearPlannedSnapshot: (stepId: string) => {
        clearPlannedSnapshot(stepId)
      },
      onRequestMoveCursor: (stepId: string) => {
        followCursorForDetailsRef.current = true
        const targetIdx = stepIndexById(tableSteps, stepId)
        if (targetIdx < 0) return
        const crossesInstalled =
          targetIdx < tableCursor &&
          tableSteps
            .slice(targetIdx, tableCursor)
            .some(
              (s) =>
                s.status === 'succeeded' ||
                s.status === 'succeededWithWarnings' ||
                s.status === 'alreadyInstalled',
            )
        const label = tableSteps[targetIdx]?.modId ?? 'step'
        if (crossesInstalled && canNavigateSteps) {
          setConfirmDialog({
            title: 'Move cursor backward?',
            message: `Move the install cursor to ${label}. Installed packages between the cursor and this step will remain installed until you roll back.`,
            confirmLabel: 'Move cursor',
            onConfirm: () => {
              setConfirmDialog(null)
              followCursorForDetailsRef.current = true
              moveCursorToStep(stepId)
            },
          })
          return
        }
        moveCursorToStep(stepId)
      },
      onRemoveFromPlan: (stepId: string) => {
        const step = tableSteps.find((s) => s.stepId === stepId)
        if (!step || !onDeselectComponent) return
        onDeselectComponent(step.componentId)
      },
    }
  }, [
    planSteps.length,
    run,
    steps,
    canNavigateSteps,
    canGoPreviousEffective,
    canSkipEffective,
    installLock,
    onDeselectComponent,
    requestGoPrevious,
    skipCurrent,
    uninstallBackToStep,
    toggleBreakpoint,
    clearPlannedSnapshot,
    moveCursorToStep,
    game,
  ])

  const statusText = useMemo(() => {
    if (!run) return `${planSteps.length} steps planned`
    const done = run.steps.filter(
      (s) =>
        s.status === 'succeeded' ||
        s.status === 'alreadyInstalled' ||
        s.status === 'skipped',
    ).length
    return `${done}/${run.steps.length} - ${run.runState}`
  }, [run, planSteps.length])

  const ensureVanillas = useCallback(async (): Promise<boolean> => {
    if (!game) return false
    let registry = readVanillaRegistry()
    let missing = missingVanillaKeys(game, registry)
    if (missing.length === 0) return true

    if (appDirs.backupDir) {
      for (const key of [...missing]) {
        try {
          const manifest = await listBackups(appDirs.backupDir, key)
          const path = manifest.vanilla?.path?.trim()
          if (path) {
            setVanillaBinding(key, { mode: 'managed', path })
          }
        } catch {
          /* ignore */
        }
      }
      registry = readVanillaRegistry()
      missing = missingVanillaKeys(game, registry)
      if (missing.length === 0) return true
    }

    const key = missing[0]!
    setNotice(`Set vanilla backup for ${key} in Settings.`)
    onOpenSettings()
    return false
  }, [game, appDirs.backupDir, onOpenSettings])

  const onStart = useCallback(async () => {
    if (!canRun || isRunning || transportBusy) return
    if (resumeFromCursor) {
      await continueRun()
      return
    }
    const next = run?.runState === 'idle' ? run : initRun()
    if (!next) return
    const ok = await ensureVanillas()
    if (!ok) return
    await start(next)
  }, [
    canRun,
    isRunning,
    transportBusy,
    resumeFromCursor,
    run,
    continueRun,
    initRun,
    ensureVanillas,
    start,
  ])

  const onPauseToggle = useCallback(() => {
    pause()
  }, [pause])

  const onRestoreDone = useCallback(
    async (_backupPath: string, restoredGameKey: string) => {
      if (!game) return
      setNotice('Snapshot restored.')
      if (!run) return
      const targetDir =
        restoredGameKey === 'bg1'
          ? gameFolders.bg1
          : restoredGameKey === 'bg2'
            ? gameFolders.bg2
            : restoredGameKey === 'iwd'
              ? gameFolders.iwd
              : restoredGameKey === 'pst'
                ? gameFolders.pst
                : gameDirForPhase(
                    game,
                    run.steps[run.cursor]?.phase ?? run.steps[0]?.phase ?? 'single',
                    gameFolders,
                  )
      if (!targetDir) return
      await restartFromBackup(targetDir)
    },
    [game, run, gameFolders, restartFromBackup],
  )

  const refreshSnapshotCount = useCallback(() => {
    setSnapshotListTick((n) => n + 1)
  }, [])

  const snapshotGameKeys = useMemo(
    () => (game === 'eet' ? ['bg1', 'bg2'] : game ? [game] : []),
    [game],
  )

  const snapshotDirsByKey = useMemo(
    () => ({
      bg1: gameFolders.bg1,
      bg2: gameFolders.bg2,
      iwd: gameFolders.iwd,
      pst: gameFolders.pst,
    }),
    [gameFolders],
  )

  useEffect(() => {
    if (!appDirs.backupDir || snapshotGameKeys.length === 0) {
      setSnapshotCount(0)
      return
    }
    let cancelled = false
    void (async () => {
      const counts = await Promise.all(
        snapshotGameKeys.map(async (key) => {
          try {
            const manifest = await listBackups(appDirs.backupDir, key)
            return manifest.snapshots.length
          } catch {
            return 0
          }
        }),
      )
      if (!cancelled) {
        setSnapshotCount(counts.reduce((sum, n) => sum + n, 0))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [appDirs.backupDir, snapshotGameKeys, snapshotListTick, pathTick])

  const prevPlannedSnapshotBusy = useRef(false)
  useEffect(() => {
    if (prevPlannedSnapshotBusy.current && !plannedSnapshotBusy) {
      refreshSnapshotCount()
    }
    prevPlannedSnapshotBusy.current = plannedSnapshotBusy
  }, [plannedSnapshotBusy, refreshSnapshotCount])

  const openTakeSnapshot = useCallback(() => {
    if (!snapshotTarget?.sourceDir) return
    setTakeError(null)
    setTakeProgress(null)
    setTakeSnapshotDialog({
      gameKey: snapshotTarget.gameKey,
      sourceDir: snapshotTarget.sourceDir,
      name: defaultSnapshotName(),
    })
  }, [snapshotTarget])

  const cancelTakeSnapshot = useCallback(() => {
    if (snapshotBusy) return
    setTakeSnapshotDialog(null)
    setTakeError(null)
    setTakeProgress(null)
  }, [snapshotBusy])

  const onTakeSnapshot = useCallback(
    async (name: string) => {
      if (!takeSnapshotDialog || !appDirs.backupDir) return
      setSnapshotBusy(true)
      setTakeError(null)
      setTakeProgress({
        phase: 'start',
        message: 'Starting snapshot…',
        filesDone: 0,
        bytesDone: 0,
        filesTotal: 0,
        bytesTotal: 0,
      })
      let unlisten: (() => void) | undefined
      try {
        unlisten = await listenBackupProgress(setTakeProgress)
        await createNamedBackup({
          sourceDir: takeSnapshotDialog.sourceDir,
          backupRoot: appDirs.backupDir,
          gameKey: takeSnapshotDialog.gameKey,
          kind: 'snapshot',
          name,
          excludeSafeDirs: false,
        })
        appendCommandLine(
          `Snapshot saved: ${name} (${takeSnapshotDialog.gameKey})`,
        )
        pushToast({ tone: 'success', message: `Snapshot saved: ${name}` })
        setTakeSnapshotDialog(null)
        setTakeProgress(null)
        refreshSnapshotCount()
      } catch (e) {
        const message = String(e)
        setTakeError(message)
        appendCommandLine(`Snapshot failed: ${message}`)
        pushToast({ tone: 'error', message })
      } finally {
        unlisten?.()
        setSnapshotBusy(false)
      }
    },
    [
      takeSnapshotDialog,
      appDirs.backupDir,
      appendCommandLine,
      pushToast,
      refreshSnapshotCount,
    ],
  )

  const gameDirForKey = useCallback(
    (key: string): string => {
      if (key === 'bg1') return gameFolders.bg1
      if (key === 'bg2') return gameFolders.bg2
      if (key === 'iwd') return gameFolders.iwd
      if (key === 'pst') return gameFolders.pst
      return ''
    },
    [gameFolders],
  )

  const onRestartConfirm = useCallback(
    async (scope: RestartScope): Promise<boolean> => {
      setRestartDialogOpen(false)
      if (!game || !appDirs.backupDir) return false

      const keys: string[] =
        game === 'eet'
          ? scope === 'full'
            ? ['bg1', 'bg2']
            : ['bg2']
          : [game]

      setSnapshotBusy(true)
      setNotice('Restoring vanilla backup…')
      let unlisten: (() => void) | undefined
      try {
        await stopRunningInstall()
        unlisten = await listenBackupProgress(() => {})

        for (const key of keys) {
          const manifest = await listBackups(appDirs.backupDir, key)
          const vanillaPath = manifest.vanilla?.path?.trim()
          if (!vanillaPath) {
            throw new Error(`No vanilla backup for ${key}. Set it in Settings.`)
          }
          const dest = gameDirForKey(key)
          if (!dest) {
            throw new Error(`Set ${key} game folder in Settings.`)
          }
          appendCommandLine(`Restart: restoring vanilla (${key})…`)
          await restoreGameDir(vanillaPath, dest)
        }

        if (run) {
          const primaryDir =
            keys.includes('bg2') ? gameFolders.bg2 : gameDirForKey(keys[0] ?? game)
          if (primaryDir) await restartFromBackup(primaryDir)
        }

        setNotice('Game restored from vanilla backup.')
        pushToast({ tone: 'success', message: 'Game restored from vanilla backup.' })
        appendCommandLine('Restart complete — vanilla backup restored.')
        return true
      } catch (e) {
        const message = String(e)
        setNotice(message)
        pushToast({ tone: 'error', message })
        appendCommandLine(`Restart failed: ${message}`)
        return false
      } finally {
        unlisten?.()
        setSnapshotBusy(false)
      }
    },
    [
      game,
      appDirs.backupDir,
      gameFolders.bg2,
      gameDirForKey,
      stopRunningInstall,
      run,
      restartFromBackup,
      appendCommandLine,
      pushToast,
    ],
  )

  useEffect(() => {
    if (!onInstallActionsReady) return
    onInstallActionsReady({ performVanillaRestart: onRestartConfirm })
    return () => onInstallActionsReady(null)
  }, [onInstallActionsReady, onRestartConfirm])

  const onCleanup = useCallback(async () => {
    if (!game || !run) return
    const staged = [...new Set(run.steps.map((s) => s.stagedFolderName).filter(Boolean))]
    const keep = [...adjustmentsModIds].filter((id) => staged.includes(id))
    const phase = run.steps[0]?.phase ?? 'single'
    const gameDir = gameDirForPhase(game, phase, gameFolders)
    try {
      await cleanupInstallArtifacts({
        gameDir,
        stagedFolders: staged,
        keepFolders: keep,
        weiduPath,
        logDir: run.logDir,
      })
      setCleanupOffer(false)
      setNotice('Cleanup finished.')
      pushToast({ tone: 'success', message: 'Cleanup finished.' })
    } catch (e) {
      const message = String(e)
      setNotice(message)
      pushToast({ tone: 'error', message })
    }
  }, [game, run, adjustmentsModIds, gameFolders, weiduPath, pushToast])

  const onSelectStep = useCallback((stepId: string, componentId: string) => {
    const t0 = profileInstallTable ? performance.now() : 0
    followCursorForDetailsRef.current = false
    setSelectedStepId(stepId)
    setSelectedComponentId(componentId)
    if (profileInstallTable) {
      const elapsed = performance.now() - t0
      if (elapsed > 1) {
        console.debug('[install-perf] onSelectStep handler ms=', elapsed.toFixed(2))
      }
    }
  }, [profileInstallTable])

  const playActive = isRunning && !pausePending && !stopping
  const pauseActive = pausePending || run?.runState === 'paused'
  const stopActive = stopping
  const skipActive = skipping
  const previousActive = goingPrevious

  const previousTip = 'Go back one step and uninstall that package'
  const playTip = resumeFromCursor
    ? 'Resume from cursor'
    : 'Start installation'
  const pauseTip = pausePending
    ? 'Pause after current step (click again to cancel)'
    : run?.runState === 'running'
      ? 'Pause (finish current WeiDU step)'
      : 'Resume'
  const stopTip =
    'Stop — kills WeiDU and uninstalls the interrupted package. Less safe than Pause.'
  const skipTip = 'Skip package at cursor'

  return (
    <div className="install-station">
      <div
        className={`workspace install-workspace${detailCollapsed ? ' detail-collapsed' : ''}`}
        style={{ '--detail-width': `${detailWidth}px` } as CSSProperties}
      >
        <div className="install-main">
          <div className="install-toolbar">
            <div className="install-toolbar-controls">
              <span
                className="install-run-duration"
                aria-label="Total install duration"
              >
                {formatPlayerDurationMs(runElapsedMs)}
              </span>
              <button
                type="button"
                className={`btn secondary install-control-btn has-icon-tip${previousActive ? ' active' : ''}`}
                disabled={!canGoPreviousEffective}
                aria-pressed={previousActive}
                onClick={requestGoPrevious}
                aria-label={previousTip}
              >
                <SkipPreviousIcon />
                <IconTip>{previousTip}</IconTip>
              </button>
              <button
                type="button"
                className={`btn secondary install-control-btn install-control-start has-icon-tip${playActive ? ' active' : ''}`}
                disabled={!canRun || isRunning || transportBusy}
                aria-pressed={playActive}
                onClick={() => void onStart()}
                aria-label={playTip}
              >
                <PlayIcon />
                <IconTip>{playTip}</IconTip>
              </button>
              <button
                type="button"
                className={`btn secondary install-control-btn has-icon-tip${pauseActive ? ' active' : ''}${pausePending ? ' pending' : ''}`}
                disabled={!canPauseToggle}
                aria-pressed={pauseActive}
                onClick={onPauseToggle}
                aria-label={pauseTip}
              >
                <PauseIcon />
                <IconTip>{pauseTip}</IconTip>
              </button>
              <button
                type="button"
                className={`btn secondary install-control-btn has-icon-tip${stopActive ? ' active' : ''}`}
                disabled={!canStop}
                aria-pressed={stopActive}
                onClick={() => void stop()}
                aria-label={stopTip}
              >
                <StopIcon />
                <IconTip>{stopTip}</IconTip>
              </button>
              <button
                type="button"
                className={`btn secondary install-control-btn has-icon-tip${skipActive ? ' active' : ''}`}
                disabled={!canSkipEffective}
                aria-pressed={skipActive}
                onClick={() => skipCurrent()}
                aria-label={skipTip}
              >
                <SkipNextIcon />
                <IconTip>{skipTip}</IconTip>
              </button>
              {!modsReady ? (
                <span className="install-toolbar-note">Missing mods on disk</span>
              ) : null}
            </div>

            <div className="install-toolbar-actions">
              <span className="install-action-icon-wrap has-icon-tip">
                <button
                  type="button"
                  className={`install-action-icon-btn${hideInstalled ? ' active' : ''}`}
                  aria-pressed={hideInstalled}
                  aria-label="Hide installed"
                  onClick={() => setHideInstalled((v) => !v)}
                >
                  <HideInstalledIcon />
                </button>
                <IconTip>Hide installed</IconTip>
              </span>
              <span className="install-action-icon-wrap has-icon-tip">
                <button
                  type="button"
                  className="install-action-icon-btn"
                  disabled={!canRestart}
                  aria-label={restartTip}
                  onClick={() => setRestartDialogOpen(true)}
                >
                  <RestartIcon />
                </button>
                <IconTip>{restartTip}</IconTip>
              </span>
              <span className="install-action-icon-wrap has-icon-tip">
                <button
                  type="button"
                  className="install-action-icon-btn"
                  disabled={!canTakeSnapshot}
                  aria-label={takeTip}
                  onClick={openTakeSnapshot}
                >
                  <SnapshotIcon />
                </button>
                <IconTip>{takeTip}</IconTip>
              </span>
              <span className="install-action-icon-wrap has-icon-tip">
                <button
                  type="button"
                  className="install-action-icon-btn"
                  disabled={!canRestoreSnapshot}
                  aria-label={restoreTip}
                  onClick={() => setRestoreDialogOpen(true)}
                >
                  <RestoreSnapshotIcon />
                </button>
                <IconTip>{restoreTip}</IconTip>
              </span>
            </div>
          </div>

          {notice ? <p className="install-notice">{notice}</p> : null}

          {cleanupOffer ? (
            <div className="install-cleanup-offer">
              <span>Run finished.</span>
              <button type="button" className="btn secondary" onClick={() => void onCleanup()}>
                Clean up mod folders
              </button>
              <button type="button" className="btn secondary" onClick={() => setCleanupOffer(false)}>
                Dismiss
              </button>
            </div>
          ) : null}

          <InstallTable
            steps={steps}
            model={model}
            mods={mods}
            selectedStepId={selectedStep?.stepId ?? null}
            selectedComponentId={selectedComponentId}
            cursorStepId={cursorStepId}
            cursorLive={run?.runState === 'running' && !pausePending}
            runState={run?.runState ?? null}
            hideInstalled={hideInstalled}
            tableActions={tableActions}
            onSelectStep={onSelectStep}
          />
        </div>
        <InstallDetailPane
          step={selectedStep}
          selectedComponentId={selectedComponentId}
          runState={run?.runState ?? null}
          model={model}
          mods={mods}
          collapsed={detailCollapsed}
          width={detailWidth}
          onWidthChange={onDetailWidthChange}
          onToggleCollapsed={onToggleDetailCollapsed}
        />
      </div>

      <InstallConsoleDock
        lines={consoleLines}
        commandLines={commandLines}
        resultLines={resultLines}
        logDir={run?.logDir ?? null}
        statusText={statusText}
        collapsed={consoleCollapsed}
        onToggleCollapsed={() => setConsoleCollapsed((v) => !v)}
        waitingForInput={
          !!inputPrompt || run?.runState === 'waitingForInput'
        }
        inputPrompt={inputPrompt}
        onSendInput={(text) => void sendInput(text)}
      />

      <RestoreSnapshotDialog
        open={restoreDialogOpen}
        backupRoot={appDirs.backupDir}
        gameKeys={snapshotGameKeys}
        dirsByKey={snapshotDirsByKey}
        targetDir={snapshotTarget?.sourceDir ?? ''}
        onClose={() => setRestoreDialogOpen(false)}
        onRestoreDone={(path, key) => void onRestoreDone(path, key)}
        onBusyChange={setSnapshotBusy}
        onLog={appendCommandLine}
        onSnapshotsChange={refreshSnapshotCount}
      />

      <RestartConfirmDialog
        open={restartDialogOpen}
        eetMode={game === 'eet'}
        onCancel={() => setRestartDialogOpen(false)}
        onConfirm={(scope) => void onRestartConfirm(scope)}
      />

      <ConfirmDialog
        open={confirmDialog != null}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel ?? 'Continue'}
        danger={confirmDialog?.danger}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

      <PlanSnapshotDialog
        open={planSnapshotDialog != null}
        gameLabel={
          planSnapshotDialog
            ? gameFolderKeyLabel(planSnapshotDialog.gameKey)
            : 'game'
        }
        initialName={planSnapshotDialog?.name ?? ''}
        onConfirm={(name) => {
          if (!planSnapshotDialog) return
          setPlannedSnapshot(planSnapshotDialog.stepId, name)
          setPlanSnapshotDialog(null)
        }}
        onCancel={() => setPlanSnapshotDialog(null)}
      />

      <PlanSnapshotDialog
        open={takeSnapshotDialog != null}
        title="Take snapshot"
        message={
          takeSnapshotDialog
            ? `Copies ${gameFolderKeyLabel(takeSnapshotDialog.gameKey)} now.`
            : 'Copies the game folder now.'
        }
        confirmLabel="Take snapshot"
        gameLabel={
          takeSnapshotDialog
            ? gameFolderKeyLabel(takeSnapshotDialog.gameKey)
            : 'game'
        }
        initialName={takeSnapshotDialog?.name ?? ''}
        busy={snapshotBusy}
        progress={takeProgress}
        error={takeError}
        onConfirm={(name) => {
          void onTakeSnapshot(name)
        }}
        onCancel={cancelTakeSnapshot}
      />
    </div>
  )
}
