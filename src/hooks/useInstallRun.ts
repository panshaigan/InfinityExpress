import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import type { GameFolderPaths } from '../lib/ui/gameFolderPrefs'
import { readAppDirPaths } from '../lib/ui/appDirPrefs'
import {
  gameFolderKeyForPhase,
  readGameFolderVersions,
} from '../lib/ui/gameFolderPrefs'
import { readWeiduPath } from '../lib/ui/weiduPrefs'
import { buildInstallPlan } from '../lib/install/planBuilder'
import type {
  InstallRun,
  InstallRunState,
  InstallStep,
  ModListingCache,
  WeiduInstallEvent,
} from '../lib/install/types'
import { resolveModForInstall } from '../lib/install/modResolution'
import {
  cancelWeiduStep,
  gameDirForPhase,
  listenStageProgress,
  listenWeiduInstallEvents,
  readGameWeiduLog,
  runWeiduStep,
  sendWeiduStdin,
} from '../lib/desktop/weiduInstall'
import { isComponentInstalledInLog } from '../lib/install/weiduLog'

function newRunId(): string {
  return `run-${Date.now()}`
}

function stepFolderName(step: InstallStep, index: number): string {
  const safeMod = step.modId.replace(/[^\w.-]+/g, '_').slice(0, 40)
  return `${String(index + 1).padStart(3, '0')}-${safeMod}`
}

function appendInstallLog(logDir: string, line: string) {
  // Installation log is written from streamed events in the hook state;
  // per-step logs are written by Rust. Keep a lightweight in-memory trace.
  void logDir
  void line
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function useInstallRun(options: {
  model: InstallSequenceModel
  selectedIds: ReadonlySet<string>
  game: SelectedGame | null
  gameFolders: GameFolderPaths
}) {
  const { model, selectedIds, game, gameFolders } = options
  const [run, setRun] = useState<InstallRun | null>(null)
  const [consoleLines, setConsoleLines] = useState<string[]>([])
  const [inputPrompt, setInputPrompt] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const cacheRef = useRef<ModListingCache>(new Map())
  const runningRef = useRef(false)
  const pausedRef = useRef(false)
  const activeStepIdRef = useRef<string | null>(null)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    activeStepIdRef.current = activeStepId
  }, [activeStepId])

  const planSteps = useMemo(() => {
    if (!game) return []
    return buildInstallPlan(model, selectedIds, game)
  }, [model, selectedIds, game])

  const initRun = useCallback(() => {
    if (!game) return null
    const appDirs = readAppDirPaths()
    const runId = newRunId()
    const logDir = appDirs.backupDir
      ? `${appDirs.backupDir.replace(/\\/g, '/').replace(/\/$/, '')}/install-logs/${runId}`
      : ''
    const steps: InstallStep[] = planSteps.map((s) => ({
      ...s,
      tp2Path: '',
      stagedFolderName: '',
      weiduNumbers: [],
      languageIndex: null,
      progress: null,
    }))
    const next: InstallRun = {
      runId,
      game,
      steps,
      cursor: 0,
      runState: 'idle',
      logDir,
    }
    setRun(next)
    setConsoleLines([])
    setInputPrompt(null)
    setPaused(false)
    setActiveStepId(null)
    cacheRef.current = new Map()
    return next
  }, [game, planSteps])

  useEffect(() => {
    let cancelled = false
    let unlisten: { current?: () => void } = {}
    void listenWeiduInstallEvents((ev: WeiduInstallEvent) => {
      if (ev.kind === 'output') {
        setConsoleLines((prev) => [...prev.slice(-4999), ev.text])
      } else if (ev.kind === 'inputRequired') {
        setInputPrompt(ev.prompt)
        setRun((r) => (r ? { ...r, runState: 'waitingForInput' } : r))
      } else if (ev.kind === 'classified') {
        setConsoleLines((prev) => [
          ...prev.slice(-4999),
          `[${ev.level}] ${ev.message}`,
        ])
        appendInstallLog('', `${ev.level}: ${ev.message}`)
      } else if (ev.kind === 'stepStarted') {
        setActiveStepId(ev.stepId)
        setRun((r) => {
          if (!r) return r
          return {
            ...r,
            steps: r.steps.map((s) =>
              s.stepId === ev.stepId
                ? {
                    ...s,
                    status: 'installing',
                    progress: {
                      filesDone: 0,
                      bytesDone: 0,
                      indeterminate: true,
                      label: 'Installing…',
                    },
                  }
                : s,
            ),
            runState: 'running',
          }
        })
      } else if (ev.kind === 'stepFinished') {
        setRun((r) => {
          if (!r) return r
          return {
            ...r,
            steps: r.steps.map((s) => {
              if (s.stepId !== ev.stepId) return s
              const status = ev.success
                ? 'succeeded'
                : s.status === 'needsInput'
                  ? 'needsInput'
                  : 'failed'
              return {
                ...s,
                status,
                progress: null,
                finishedAt: new Date().toISOString(),
              }
            }),
          }
        })
      }
    }).then((fn) => {
      if (cancelled) {
        fn()
        return
      }
      unlisten.current = fn
    })
    return () => {
      cancelled = true
      unlisten.current?.()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listenStageProgress((payload) => {
      const stepId = activeStepIdRef.current
      if (!stepId) return
      const label =
        payload.phase === 'done'
          ? `Copied ${payload.filesDone} files · ${formatBytes(payload.bytesDone)}`
          : payload.filesDone > 0
            ? `${payload.filesDone} files · ${formatBytes(payload.bytesDone)}`
            : payload.message || 'Copying…'
      setRun((r) => {
        if (!r) return r
        return {
          ...r,
          steps: r.steps.map((s) =>
            s.stepId === stepId
              ? {
                  ...s,
                  status: s.status === 'copying' ? 'copying' : s.status,
                  progress: {
                    filesDone: payload.filesDone,
                    bytesDone: payload.bytesDone,
                    indeterminate: true,
                    label,
                  },
                }
              : s,
          ),
        }
      })
      if (payload.phase === 'start' || payload.phase === 'done') {
        setConsoleLines((prev) => [...prev.slice(-4999), `[stage] ${payload.message}`])
      }
    }).then((fn) => {
      if (cancelled) {
        fn()
        return
      }
      unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const markAlreadyInstalledFromLog = useCallback(
    async (steps: InstallStep[], gameDir: string): Promise<InstallStep[]> => {
      const log = await readGameWeiduLog(gameDir)
      if (!log.trim()) return steps
      return steps.map((step): InstallStep => {
        if (step.languageIndex == null || step.weiduNumbers.length === 0) {
          return step
        }
        const allInstalled = step.weiduNumbers.every((n) =>
          isComponentInstalledInLog(log, step.tp2Path, step.languageIndex!, n),
        )
        if (allInstalled && (step.status === 'queued' || step.status === 'copying')) {
          return { ...step, status: 'alreadyInstalled', progress: null }
        }
        return step
      })
    },
    [],
  )

  const executeFromCursor = useCallback(
    async (startRun: InstallRun) => {
      if (runningRef.current) return
      runningRef.current = true
      let current = startRun
      setRun({ ...current, runState: 'running' })

      try {
        for (let i = current.cursor; i < current.steps.length; i++) {
          while (pausedRef.current) {
            await new Promise((r) => setTimeout(r, 200))
          }

          let step = current.steps[i]!
          if (
            step.status === 'succeeded' ||
            step.status === 'alreadyInstalled' ||
            step.status === 'skipped'
          ) {
            continue
          }

          try {
            const gameDir = gameDirForPhase(current.game, step.phase, gameFolders)
            setActiveStepId(step.stepId)
            step = {
              ...step,
              status: 'copying',
              startedAt: new Date().toISOString(),
              progress: {
                filesDone: 0,
                bytesDone: 0,
                indeterminate: true,
                label: 'Preparing…',
              },
            }
            current = {
              ...current,
              steps: current.steps.map((s, idx) => (idx === i ? step : s)),
              cursor: i,
            }
            setRun({ ...current, runState: 'running' })
            setConsoleLines((prev) => [
              ...prev.slice(-4999),
              `[stage] Resolving ${step.modId} for ${gameDir || '(no game dir)'}…`,
            ])

            const weiduPath = readWeiduPath()
            const appDirs = readAppDirPaths()
            const gameVersion =
              readGameFolderVersions()[
                gameFolderKeyForPhase(current.game, step.phase)
              ] ?? ''
            const componentNodes = step.componentIds
              .map((id) => model.componentsById.get(id))
              .filter((n): n is NonNullable<typeof n> => !!n)

            const resolved = await resolveModForInstall(
              cacheRef.current,
              weiduPath,
              appDirs.modsDownloadDir,
              gameDir,
              step.modId,
              componentNodes,
              gameVersion,
            )

            if (resolved.didStage) {
              setConsoleLines((prev) => [
                ...prev.slice(-4999),
                `[stage] Copied ${step.modId} → ${gameDir}/${resolved.stagedFolderName}`,
                `[stage] tp2: ${resolved.tp2Path}`,
              ])
            } else {
              setConsoleLines((prev) => [
                ...prev.slice(-4999),
                `[stage] Reusing staged ${resolved.stagedFolderName} (${resolved.tp2Path})`,
              ])
            }

            const weiduNumbers: number[] = []
            const errors: string[] = []
            if (resolved.languageError) errors.push(resolved.languageError)
            for (const id of step.componentIds) {
              const r = resolved.componentResults.get(id)
              if (!r) {
                errors.push(`Could not resolve component ${id}`)
                continue
              }
              if (r.error) errors.push(r.error)
              else if (r.weiduNumber != null) weiduNumbers.push(r.weiduNumber)
            }

            const stepLogDir = current.logDir
              ? `${current.logDir}/${stepFolderName(step, i)}`
              : ''

            if (errors.length > 0 || weiduNumbers.length !== step.componentIds.length) {
              step = {
                ...step,
                tp2Path: resolved.tp2Path,
                stagedFolderName: resolved.stagedFolderName,
                weiduNumbers,
                languageIndex: resolved.languageIndex,
                status: 'needsInput',
                progress: null,
                errors: [...step.errors, ...errors],
                stdoutLogPath: stepLogDir ? `${stepLogDir}/stdout.log` : undefined,
                stderrLogPath: stepLogDir ? `${stepLogDir}/stderr.log` : undefined,
              }
              current = {
                ...current,
                steps: current.steps.map((s, idx) => (idx === i ? step : s)),
                cursor: i,
              }
              for (const err of errors) {
                setConsoleLines((prev) => [...prev.slice(-4999), `[error] ${err}`])
              }
              if (errors.length === 0) {
                setConsoleLines((prev) => [
                  ...prev.slice(-4999),
                  `[error] Could not resolve all WeiDU component numbers for ${step.modId}`,
                ])
              }
              setRun({ ...current, runState: 'waitingForInput' })
              runningRef.current = false
              return
            }

            step = {
              ...step,
              tp2Path: resolved.tp2Path,
              stagedFolderName: resolved.stagedFolderName,
              weiduNumbers,
              languageIndex: resolved.languageIndex,
              status: 'installing',
              progress: {
                filesDone: 0,
                bytesDone: 0,
                indeterminate: true,
                label: 'Installing…',
              },
              stdoutLogPath: stepLogDir ? `${stepLogDir}/stdout.log` : undefined,
              stderrLogPath: stepLogDir ? `${stepLogDir}/stderr.log` : undefined,
            }
            current = {
              ...current,
              steps: current.steps.map((s, idx) => (idx === i ? step : s)),
              cursor: i,
            }
            setRun({ ...current, runState: 'running' })

            const log = await readGameWeiduLog(gameDir)
            if (
              step.languageIndex != null &&
              step.weiduNumbers.every((n) =>
                isComponentInstalledInLog(log, step.tp2Path, step.languageIndex!, n),
              )
            ) {
              step = { ...step, status: 'alreadyInstalled', progress: null }
              current = {
                ...current,
                steps: current.steps.map((s, idx) => (idx === i ? step : s)),
                cursor: i + 1,
              }
              setRun({ ...current, runState: 'running' })
              continue
            }

            const result = await runWeiduStep({
              weiduPath: readWeiduPath(),
              tp2Path: step.tp2Path,
              gameDir,
              componentNumbers: step.weiduNumbers,
              languageIndex: step.languageIndex ?? 0,
              stepId: step.stepId,
              logDir: current.logDir,
              stepFolder: stepFolderName(step, i),
            })

            let status: InstallStep['status'] = 'failed'
            if (result.cancelled) status = 'failed'
            else if (result.timedOut) status = 'failed'
            else if (result.exitCode === 0 && result.logVerified) status = 'succeeded'
            else if (result.exitCode === 0) status = 'succeededWithWarnings'
            else status = 'failed'

            step = {
              ...step,
              status,
              progress: null,
              debugLogPath: result.debugPath ?? undefined,
              warnings:
                result.logVerified || status === 'succeeded'
                  ? step.warnings
                  : [...step.warnings, 'WeiDU.log verification incomplete'],
              errors:
                status === 'failed'
                  ? [...step.errors, `Exit code ${result.exitCode ?? 'unknown'}`]
                  : step.errors,
              finishedAt: new Date().toISOString(),
            }

            current = {
              ...current,
              steps: current.steps.map((s, idx) => (idx === i ? step : s)),
              cursor: i + 1,
            }
            setRun({ ...current, runState: status === 'failed' ? 'failed' : 'running' })

            if (status === 'failed') {
              runningRef.current = false
              return
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            setConsoleLines((prev) => [...prev.slice(-4999), `[error] ${message}`])
            step = {
              ...step,
              status: 'failed',
              progress: null,
              errors: [...step.errors, message],
              finishedAt: new Date().toISOString(),
            }
            current = {
              ...current,
              steps: current.steps.map((s, idx) => (idx === i ? step : s)),
              cursor: i,
            }
            setActiveStepId(step.stepId)
            setRun({ ...current, runState: 'failed' })
            runningRef.current = false
            return
          }
        }

        setActiveStepId(null)
        setRun({ ...current, runState: 'completed', cursor: current.steps.length })
      } finally {
        runningRef.current = false
      }
    },
    [gameFolders, model.componentsById],
  )

  const start = useCallback(async () => {
    const next = initRun() ?? run
    if (!next) return
    await executeFromCursor(next)
  }, [initRun, run, executeFromCursor])

  const continueRun = useCallback(async () => {
    if (!run) return
    setPaused(false)
    setInputPrompt(null)
    await executeFromCursor({ ...run, runState: 'running' })
  }, [run, executeFromCursor])

  const pause = useCallback(() => {
    setPaused(true)
    setRun((r) => (r ? { ...r, runState: 'paused' } : r))
  }, [])

  const stop = useCallback(async () => {
    await cancelWeiduStep()
    setRun((r) => (r ? { ...r, runState: 'paused' } : r))
  }, [])

  const skipCurrent = useCallback(async () => {
    if (!run) return
    const i = run.cursor
    const steps = run.steps.map((s, idx) =>
      idx === i ? { ...s, status: 'skipped' as const, progress: null } : s,
    )
    const next = { ...run, steps, cursor: i + 1, runState: 'running' as InstallRunState }
    setRun(next)
    setInputPrompt(null)
    await executeFromCursor(next)
  }, [run, executeFromCursor])

  const restartFromBackup = useCallback(
    async (phaseGameDir: string) => {
      if (!run) return
      let steps: InstallStep[] = run.steps.map(
        (s): InstallStep => ({
          ...s,
          status: 'queued',
          progress: null,
          warnings: [],
          errors: [],
          finishedAt: undefined,
          startedAt: undefined,
        }),
      )
      steps = await markAlreadyInstalledFromLog(steps, phaseGameDir)
      const cursor = steps.findIndex(
        (s) =>
          s.status !== 'succeeded' &&
          s.status !== 'alreadyInstalled' &&
          s.status !== 'skipped',
      )
      const next = {
        ...run,
        steps,
        cursor: cursor >= 0 ? cursor : 0,
        runState: 'idle' as InstallRunState,
      }
      setRun(next)
      setConsoleLines([])
      setInputPrompt(null)
      setActiveStepId(null)
      cacheRef.current = new Map()
      await executeFromCursor({ ...next, runState: 'running' })
    },
    [run, markAlreadyInstalledFromLog, executeFromCursor],
  )

  const sendInput = useCallback(async (text: string) => {
    await sendWeiduStdin(text)
    setInputPrompt(null)
    setRun((r) =>
      r && r.runState === 'waitingForInput' ? { ...r, runState: 'running' } : r,
    )
  }, [])

  return {
    run,
    planSteps,
    consoleLines,
    inputPrompt,
    paused,
    activeStepId,
    initRun,
    start,
    continueRun,
    pause,
    stop,
    skipCurrent,
    restartFromBackup,
    sendInput,
    setRun,
  }
}
