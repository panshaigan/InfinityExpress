import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useInstallRun } from '../../hooks/useInstallRun'
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
import { InstallConsoleDock } from './InstallConsoleDock'
import { InstallDetailPane } from './InstallDetailPane'
import { InstallTable } from './InstallTable'
import {
  PauseIcon,
  PlayIcon,
  SkipNextIcon,
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
    inputPrompt,
    activeStepId,
    initRun,
    start,
    continueRun,
    pause,
    stop,
    skipCurrent,
    restartFromBackup,
    sendInput,
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
  const prevRunStateRef = useRef(run?.runState ?? null)
  const promptedMissingPathsRef = useRef(false)

  const steps = run?.steps ?? planSteps.map((s) => ({
    ...s,
    tp2Path: '',
    stagedFolderName: '',
    weiduNumbers: [],
    languageIndex: null,
  }))

  const selectedStep = useMemo(
    () => steps.find((s) => s.stepId === selectedStepId) ?? steps[0] ?? null,
    [steps, selectedStepId],
  )

  useEffect(() => {
    if (activeStepId) {
      setSelectedStepId(activeStepId)
      return
    }
    if (!selectedStepId && steps[0]) setSelectedStepId(steps[0].stepId)
  }, [steps, selectedStepId, activeStepId])

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
  const canPauseToggle =
    !!run &&
    (run.runState === 'running' ||
      run.runState === 'paused' ||
      run.runState === 'failed' ||
      run.runState === 'waitingForInput')

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

  const ensureBaselines = useCallback(async (): Promise<boolean> => {
    if (!game || !appDirs.backupDir) return false
    const keys =
      game === 'eet' ? (['bg1', 'bg2'] as const) : ([game] as const)
    for (const key of keys) {
      const manifest = await listBackups(appDirs.backupDir, key)
      if (!manifest.baseline) {
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
        setBackupDialog('baseline')
        return false
      }
    }
    return true
  }, [game, appDirs.backupDir, gameFolders, onOpenSettings])

  const onStart = useCallback(async () => {
    if (!canRun || isRunning) return
    initRun()
    const ok = await ensureBaselines()
    if (!ok) return
    await start()
  }, [canRun, isRunning, initRun, ensureBaselines, start])

  const onPauseToggle = useCallback(() => {
    if (!run) return
    if (run.runState === 'running') {
      pause()
      return
    }
    if (
      run.runState === 'paused' ||
      run.runState === 'failed' ||
      run.runState === 'waitingForInput'
    ) {
      void continueRun()
    }
  }, [run, pause, continueRun])

  const onRestoreDone = useCallback(
    async (_backupPath: string) => {
      if (!game) return
      setNotice('Backup restored.')
      if (!run) return
      const step = run.steps[run.cursor] ?? run.steps[0]
      const phase = step?.phase ?? 'single'
      const targetDir = gameDirForPhase(game, phase, gameFolders)
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

  const pauseTip =
    run?.runState === 'running'
      ? 'Pause'
      : run?.runState === 'waitingForInput'
        ? 'Continue'
        : 'Resume'

  return (
    <div className="install-station">
      <div className="install-toolbar">
        <div className="install-toolbar-controls">
          <button
            type="button"
            className="btn primary install-control-start has-icon-tip"
            disabled={!canRun || isRunning}
            onClick={() => void onStart()}
            aria-label="Start"
          >
            <PlayIcon />
            <IconTip>Start</IconTip>
          </button>
          <button
            type="button"
            className="btn secondary install-control-btn has-icon-tip"
            disabled={!canPauseToggle}
            onClick={onPauseToggle}
            aria-label={pauseTip}
          >
            <PauseIcon />
            <IconTip>{pauseTip}</IconTip>
          </button>
          <button
            type="button"
            className="btn secondary install-control-btn has-icon-tip"
            disabled={!run || !isRunning}
            onClick={() => void stop()}
            aria-label="Stop"
          >
            <StopIcon />
            <IconTip>Stop</IconTip>
          </button>
          <button
            type="button"
            className="btn secondary install-control-btn has-icon-tip"
            disabled={!run || run.runState !== 'waitingForInput'}
            onClick={() => void skipCurrent()}
            aria-label="Skip"
          >
            <SkipNextIcon />
            <IconTip>Skip</IconTip>
          </button>
          {!modsReady ? (
            <span className="install-toolbar-note">Missing mods on disk</span>
          ) : null}
        </div>

        <div className="install-toolbar-actions">
          <label className="install-filter-toggle">
            <input
              type="checkbox"
              checked={hideInstalled}
              onChange={(e) => setHideInstalled(e.target.checked)}
            />
            <span>Hide installed</span>
          </label>
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

      <div
        className={`workspace install-workspace${detailCollapsed ? ' detail-collapsed' : ''}`}
        style={{ '--detail-width': `${detailWidth}px` } as CSSProperties}
      >
        <div className="install-main">
          <InstallTable
            steps={steps}
            selectedStepId={selectedStep?.stepId ?? null}
            activeStepId={activeStepId}
            hideInstalled={hideInstalled}
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
        statusText={statusText}
        collapsed={consoleCollapsed}
        onToggleCollapsed={() => setConsoleCollapsed((v) => !v)}
        waitingForInput={
          !!inputPrompt ||
          (run?.runState === 'running' &&
            run.steps[run.cursor]?.status === 'installing')
        }
        inputPrompt={inputPrompt}
        onSendInput={(text) => void sendInput(text)}
      />

      <BackupManagerDialog
        open={backupDialog != null}
        mode={backupDialog ?? 'baseline'}
        initialManageTab={backupManageTab}
        backupRoot={appDirs.backupDir}
        gameKey={backupGameKey}
        sourceDir={backupSourceDir}
        targetDir={backupSourceDir}
        onClose={() => setBackupDialog(null)}
        onBaselineDone={() => void onStart()}
        onRestoreDone={(path) => void onRestoreDone(path)}
        onBusyChange={setBackupBusy}
      />
    </div>
  )
}
