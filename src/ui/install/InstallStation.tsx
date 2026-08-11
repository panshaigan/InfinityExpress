import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useInstallRun } from '../../hooks/useInstallRun'
import { collectAdjustementsModIds } from '../../lib/install/weiduResolution'
import { cleanupInstallArtifacts, gameDirForPhase, listBackups } from '../../lib/desktop/weiduInstall'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'
import type { WorkingMod } from '../../lib/mods/loadMods'
import { readAppDirPaths } from '../../lib/ui/appDirPrefs'
import { readGameFolderPaths } from '../../lib/ui/gameFolderPrefs'
import { readWeiduPath } from '../../lib/ui/weiduPrefs'
import type { InstallSequenceModel, SelectedGame } from '../../lib/xml/schema'
import { BackupManagerDialog, type BackupDialogMode } from './BackupManagerDialog'
import { InstallConsoleDock } from './InstallConsoleDock'
import { InstallDetailPane } from './InstallDetailPane'
import { InstallTable } from './InstallTable'
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
  onBusyChange,
}: Props) {
  const { pushToast } = useToast()
  const gameFolders = readGameFolderPaths()
  const appDirs = readAppDirPaths()
  const weiduPath = readWeiduPath()
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
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const [backupDialog, setBackupDialog] = useState<BackupDialogMode | null>(null)
  const [backupGameKey, setBackupGameKey] = useState('bg2')
  const [backupSourceDir, setBackupSourceDir] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [cleanupOffer, setCleanupOffer] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const prevRunStateRef = useRef(run?.runState ?? null)

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

  const modsReady = allModsPresent(neededCodenames, mods)
  const canRun = isDesktopApp() && !!game && modsReady && !!weiduPath && !!appDirs.backupDir
  const canBackup = !!game && !!appDirs.backupDir

  const openRestoreDialog = useCallback(() => {
    if (!game) return
    const step = run?.steps[run.cursor] ?? run?.steps[0]
    const phase = step?.phase ?? 'single'
    const targetDir = gameDirForPhase(game, phase, gameFolders)
    const gameKey = game === 'eet' ? (phase === 'eet1' ? 'bg1' : 'bg2') : game
    setBackupGameKey(gameKey)
    setBackupSourceDir(targetDir)
    setBackupDialog('restore')
  }, [game, run, gameFolders])

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
          return false
        }
        setBackupGameKey(key)
        setBackupSourceDir(dir)
        setBackupDialog('baseline')
        return false
      }
    }
    return true
  }, [game, appDirs.backupDir, gameFolders])

  const onStart = useCallback(async () => {
    if (!canRun) return
    initRun()
    const ok = await ensureBaselines()
    if (!ok) return
    await start()
  }, [canRun, initRun, ensureBaselines, start])

  const onRestart = useCallback(() => {
    openRestoreDialog()
  }, [openRestoreDialog])

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

  return (
    <div className="install-station">
      <div className="install-toolbar">
        <button type="button" className="btn primary" disabled={!canRun || run?.runState === 'running'} onClick={() => void onStart()}>
          Start
        </button>
        <button type="button" className="btn secondary" disabled={!run || run.runState !== 'running'} onClick={pause}>
          Pause
        </button>
        <button type="button" className="btn secondary" disabled={!run || (run.runState !== 'paused' && run.runState !== 'failed' && run.runState !== 'waitingForInput')} onClick={() => void continueRun()}>
          Continue
        </button>
        <button type="button" className="btn secondary" disabled={!run} onClick={onRestart}>
          Restart
        </button>
        <button type="button" className="btn secondary" disabled={!run || run.runState !== 'running'} onClick={() => void stop()}>
          Stop
        </button>
        <button type="button" className="btn secondary" disabled={!run || run.runState !== 'waitingForInput'} onClick={() => void skipCurrent()}>
          Skip
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={!canBackup}
          onClick={() => {
            if (!game) return
            const dir = gameDirForPhase(game, 'single', gameFolders)
            setBackupGameKey(game === 'eet' ? 'bg2' : game)
            setBackupSourceDir(dir)
            setBackupDialog('snapshot')
          }}
        >
          Back up now
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={!canBackup}
          onClick={openRestoreDialog}
        >
          Restore
        </button>
        {!modsReady ? (
          <span className="install-toolbar-note">Missing mods on disk</span>
        ) : null}
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
        className={`install-workspace${detailCollapsed ? ' detail-collapsed' : ''}`}
        style={
          !detailCollapsed
            ? ({ '--detail-width': `${detailWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="install-main">
          <InstallTable
            steps={steps}
            selectedStepId={selectedStep?.stepId ?? null}
            activeStepId={activeStepId}
            onSelectStep={setSelectedStepId}
          />
        </div>
        {!detailCollapsed ? (
          <>
            <div className="detail-resize-handle" aria-hidden="true" />
            <InstallDetailPane
              step={selectedStep}
              model={model}
              collapsed={detailCollapsed}
              width={detailWidth}
              onWidthChange={onDetailWidthChange}
              onToggleCollapsed={onToggleDetailCollapsed}
            />
          </>
        ) : (
          <InstallDetailPane
            step={selectedStep}
            model={model}
            collapsed={detailCollapsed}
            width={detailWidth}
            onWidthChange={onDetailWidthChange}
            onToggleCollapsed={onToggleDetailCollapsed}
          />
        )}
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
