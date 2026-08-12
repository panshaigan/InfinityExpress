import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useInstallRun } from '../../hooks/useInstallRun'
import { formatPlayerDurationMs } from '../../lib/install/formatDuration'
import { stepIndexById } from '../../lib/install/cursor'
import { collectAdjustementsModIds } from '../../lib/install/weiduResolution'
import { cleanupInstallArtifacts, gameDirForPhase, listBackups } from '../../lib/desktop/weiduInstall'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'
import type { WorkingMod } from '../../lib/mods/loadMods'
import { readAppDirPaths } from '../../lib/ui/appDirPrefs'
import { readGameFolderPaths } from '../../lib/ui/gameFolderPrefs'
import {
  getMissingInstallPaths,
  type MissingInstallPath,
} from '../../lib/ui/installPathValidation'
import { PATHS_CHANGED_EVENT } from '../../lib/ui/pathPrefsEvents'
import { readWeiduPath } from '../../lib/ui/weiduPrefs'
import type { InstallSequenceModel, SelectedGame } from '../../lib/xml/schema'
import { BackupManagerDialog, type BackupDialogMode } from './BackupManagerDialog'
import { ConfirmDialog } from '../ConfirmDialog'
import { InstallConsoleDock } from './InstallConsoleDock'
import { InstallDetailPane } from './InstallDetailPane'
import { InstallTable } from './InstallTable'
import {
  HideInstalledIcon,
  PauseIcon,
  PlayIcon,
  SkipNextIcon,
  SkipPreviousIcon,
  StopIcon,
} from './InstallControlIcons'
import { IconTip } from '../IconTip'
import { useToast } from '../toasts/toastContext'

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
}: Props) {
  const { pushToast } = useToast()
  const [pathTick, setPathTick] = useState(0)
  const gameFolders = readGameFolderPaths()
  const appDirs = readAppDirPaths()
  const weiduPath = readWeiduPath()
  void pathTick

  const adjustementsModIds = useMemo(
    () => collectAdjustementsModIds(model),
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
    moveCursorToStep,
    canGoPrevious,
    restartFromBackup,
    sendInput,
    appendCommandLine,
    pausePending,
    stopping,
    skipping,
    goingPrevious,
  } = useInstallRun({ model, selectedIds, game, gameFolders })

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null)
  const [hideInstalled, setHideInstalled] = useState(false)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const [backupDialog, setBackupDialog] = useState<BackupDialogMode | null>(null)
  const [backupManageTab, setBackupManageTab] = useState<'backup' | 'restore'>('backup')
  const [backupGameKey, setBackupGameKey] = useState('bg2')
  const [backupSourceDir, setBackupSourceDir] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [cleanupOffer, setCleanupOffer] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger?: boolean
    onConfirm: () => void
  } | null>(null)
  const [runElapsedMs, setRunElapsedMs] = useState(0)
  const prevRunStateRef = useRef(run?.runState ?? null)
  const promptedMissingPathsRef = useRef(false)
  const runElapsedAccumRef = useRef(0)
  const runSegmentStartRef = useRef<number | null>(null)
  const timedRunIdRef = useRef<string | null>(null)

  const steps = run?.steps ?? planSteps.map((s) => ({
    ...s,
    tp2Path: '',
    stagedFolderName: '',
    weiduNumbers: [],
    languageIndex: null,
    resultLines: s.resultLines ?? [],
  }))

  const selectedStep = useMemo(
    () => steps.find((s) => s.stepId === selectedStepId) ?? steps[0] ?? null,
    [steps, selectedStepId],
  )

  useEffect(() => {
    if (cursorStepId) {
      setSelectedStepId(cursorStepId)
      const active = steps.find((s) => s.stepId === cursorStepId)
      if (active?.componentIds[0]) {
        setSelectedComponentId((prev) =>
          prev && active.componentIds.includes(prev)
            ? prev
            : active.componentIds[0] ?? null,
        )
      }
      return
    }
    if (!selectedStepId && steps[0]) {
      setSelectedStepId(steps[0].stepId)
      setSelectedComponentId(steps[0].componentIds[0] ?? null)
    }
  }, [steps, selectedStepId, cursorStepId])

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
    onBusyChange?.(run?.runState === 'running' || backupBusy)
    return () => onBusyChange?.(false)
  }, [run?.runState, backupBusy, onBusyChange])

  const runId = run?.runId ?? null
  const runState = run?.runState ?? null
  const isRunTiming =
    runState === 'running' || runState === 'waitingForInput'

  useEffect(() => {
    if (runId !== timedRunIdRef.current) {
      timedRunIdRef.current = runId
      runElapsedAccumRef.current = 0
      runSegmentStartRef.current = null
      setRunElapsedMs(0)
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
      const missing = getMissingInstallPaths(game)
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
  }, [game, onOpenSettingsForMissing])

  const modsReady = allModsPresent(neededCodenames, mods)
  const canRun = isDesktopApp() && !!game && modsReady && !!weiduPath && !!appDirs.backupDir
  const canBackup = !!game && !!appDirs.backupDir
  const isRunning = run?.runState === 'running'
  const transportBusy = stopping || skipping || goingPrevious
  const canPauseToggle =
    !!run &&
    !transportBusy &&
    (run.runState === 'running' || run.runState === 'paused')
  const canStop =
    !!run &&
    !transportBusy &&
    (run.runState === 'running' || run.runState === 'waitingForInput')
  const canSkip =
    !!run &&
    !transportBusy &&
    (run.runState === 'paused' ||
      run.runState === 'stopped' ||
      run.runState === 'waitingForInput')
  const resumeFromCursor =
    !!run &&
    (run.runState === 'paused' ||
      run.runState === 'stopped' ||
      run.runState === 'failed' ||
      run.runState === 'waitingForInput')
  const canGoPreviousEffective = canGoPrevious && !transportBusy

  const canNavigateSteps =
    !!run && (run.runState === 'paused' || run.runState === 'stopped')

  const tableActions = useMemo(() => {
    if (planSteps.length === 0) return null
    const tableRun = run
    const tableRunState = tableRun?.runState ?? 'idle'
    const tableCursor = tableRun?.cursor ?? 0
    const tableSteps = tableRun?.steps ?? steps
    const tableBreakpoints = tableRun?.breakpointStepIds ?? []
    return {
      runState: tableRunState,
      cursor: tableCursor,
      breakpointStepIds: tableBreakpoints,
      canNavigate: canNavigateSteps,
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
      onRequestMoveCursor: (stepId: string) => {
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
              moveCursorToStep(stepId)
            },
          })
          return
        }
        moveCursorToStep(stepId)
      },
    }
  }, [
    planSteps.length,
    run,
    steps,
    canNavigateSteps,
    uninstallBackToStep,
    toggleBreakpoint,
    moveCursorToStep,
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
    if (!game || !appDirs.backupDir) return false
    const keys =
      game === 'eet' ? (['bg1', 'bg2'] as const) : ([game] as const)
    for (const key of keys) {
      const manifest = await listBackups(appDirs.backupDir, key)
      if (!manifest.vanilla) {
        const dir =
          key === 'bg1'
            ? gameFolders.bg1
            : key === 'bg2'
              ? gameFolders.bg2
              : key === 'iwd'
                ? gameFolders.iwd
                : gameFolders.pst
        if (!dir) {
          setNotice(`Set ${key} game folder in Settings.`)
          onOpenSettings()
          return false
        }
        setBackupGameKey(key)
        setBackupSourceDir(dir)
        setBackupDialog('vanilla')
        return false
      }
    }
    return true
  }, [game, appDirs.backupDir, gameFolders, onOpenSettings])

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
      setNotice('Backup restored.')
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

  const openBackupsDialog = useCallback(
    (tab: 'backup' | 'restore' = 'backup') => {
      if (!game) return
      const step = run?.steps[run.cursor] ?? run?.steps[0]
      const phase = step?.phase ?? 'single'
      const dir = gameDirForPhase(game, phase, gameFolders)
      const gameKey = game === 'eet' ? (phase === 'eet1' ? 'bg1' : 'bg2') : game
      setBackupGameKey(gameKey)
      setBackupSourceDir(dir)
      setBackupManageTab(tab)
      setBackupDialog('manage')
    },
    [game, run, gameFolders],
  )

  const backupGameKeys = useMemo(
    () => (game === 'eet' ? ['bg1', 'bg2'] : game ? [game] : [backupGameKey]),
    [game, backupGameKey],
  )

  const backupDirsByKey = useMemo(
    () => ({
      bg1: gameFolders.bg1,
      bg2: gameFolders.bg2,
      iwd: gameFolders.iwd,
      pst: gameFolders.pst,
    }),
    [gameFolders],
  )

  const onCleanup = useCallback(async () => {
    if (!game || !run) return
    const staged = [...new Set(run.steps.map((s) => s.stagedFolderName).filter(Boolean))]
    const keep = [...adjustementsModIds].filter((id) => staged.includes(id))
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
  }, [game, run, adjustementsModIds, gameFolders, weiduPath, pushToast])

  const onSelectStep = useCallback((stepId: string, componentId: string) => {
    setSelectedStepId(stepId)
    setSelectedComponentId(componentId)
  }, [])

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
                onClick={() =>
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
                }
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
                disabled={!canSkip}
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
              <button
                type="button"
                className="btn secondary"
                disabled={!canBackup}
                onClick={() => openBackupsDialog('backup')}
              >
                Backups
              </button>
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
            cursorStepId={cursorStepId ?? steps[0]?.stepId ?? null}
            cursorLive={run?.runState === 'running' && !pausePending}
            hideInstalled={hideInstalled}
            tableActions={tableActions}
            onSelectStep={onSelectStep}
          />
        </div>
        <InstallDetailPane
          step={selectedStep}
          selectedComponentId={selectedComponentId}
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
        statusText={statusText}
        collapsed={consoleCollapsed}
        onToggleCollapsed={() => setConsoleCollapsed((v) => !v)}
        waitingForInput={
          !!inputPrompt || run?.runState === 'waitingForInput'
        }
        inputPrompt={inputPrompt}
        onSendInput={(text) => void sendInput(text)}
      />

      <BackupManagerDialog
        open={backupDialog != null}
        mode={backupDialog ?? 'vanilla'}
        initialManageTab={backupManageTab}
        backupRoot={appDirs.backupDir}
        gameKeys={backupGameKeys}
        dirsByKey={backupDirsByKey}
        gameKey={backupGameKey}
        sourceDir={backupSourceDir}
        targetDir={backupSourceDir}
        eetMode={game === 'eet'}
        onClose={() => setBackupDialog(null)}
        onVanillaDone={() => void onStart()}
        onRestoreDone={(path, key) => void onRestoreDone(path, key)}
        onBusyChange={setBackupBusy}
        onLog={appendCommandLine}
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
    </div>
  )
}
