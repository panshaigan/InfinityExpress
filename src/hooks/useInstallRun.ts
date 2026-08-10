import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import type { GameFolderPaths } from '../lib/ui/gameFolderPrefs'
import { readAppDirPaths } from '../lib/ui/appDirPrefs'
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
  const cacheRef = useRef<ModListingCache>(new Map())
  const runningRef = useRef(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

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
    cacheRef.current = new Map()
    return next
  }, [game, planSteps])

  useEffect(() => {
    let unlisten: (() => void) | undefined
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
        setRun((r) => {
          if (!r) return r
          return {
            ...r,
            steps: r.steps.map((s) =>
              s.stepId === ev.stepId ? { ...s, status: 'installing' } : s,
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
              return { ...s, status, finishedAt: new Date().toISOString() }
            }),
          }
        })
      }
    }).then((fn) => {
      unlisten = fn
    })
    return () => unlisten?.()
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
        if (allInstalled && step.status === 'pending') {
          return { ...step, status: 'alreadyInstalled' }
        }
        return step
      })
    },
    [],
  )

  const prepareStep = useCallback(
    async (step: InstallStep, stepIndex: number): Promise<InstallStep> => {
      const weiduPath = readWeiduPath()
      const appDirs = readAppDirPaths()
      const gameDir = gameDirForPhase(run!.game, step.phase, gameFolders)
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
      )

      const weiduNumbers: number[] = []
      const errors: string[] = []
      if (resolved.languageError) errors.push(resolved.languageError)
      for (const id of step.componentIds) {
        const r = resolved.componentResults.get(id)
        if (!r) continue
        if (r.error) errors.push(r.error)
        else if (r.weiduNumber != null) weiduNumbers.push(r.weiduNumber)
      }

      let status = step.status
      if (errors.length > 0 || weiduNumbers.length !== step.componentIds.length) {
        status = 'needsInput'
      }

      return {
        ...step,
        tp2Path: resolved.tp2Path,
        stagedFolderName: resolved.stagedFolderName,
        weiduNumbers,
        languageIndex: resolved.languageIndex,
        status,
        errors: [...step.errors, ...errors],
        stdoutLogPath: run?.logDir
          ? `${run.logDir}/${stepFolderName(step, stepIndex)}/stdout.log`
          : undefined,
        stderrLogPath: run?.logDir
          ? `${run.logDir}/${stepFolderName(step, stepIndex)}/stderr.log`
          : undefined,
      }
    },
    [gameFolders, model.componentsById, run],
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
            step = await prepareStep(step, i)
            current = {
              ...current,
              steps: current.steps.map((s, idx) => (idx === i ? step : s)),
              cursor: i,
            }
            setRun({ ...current, runState: 'running' })

            if (step.status === 'needsInput') {
              setRun({ ...current, runState: 'waitingForInput' })
              runningRef.current = false
              return
            }

            const gameDir = gameDirForPhase(current.game, step.phase, gameFolders)
            const log = await readGameWeiduLog(gameDir)
            if (
              step.languageIndex != null &&
              step.weiduNumbers.every((n) =>
                isComponentInstalledInLog(log, step.tp2Path, step.languageIndex!, n),
              )
            ) {
              step = { ...step, status: 'alreadyInstalled' }
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
              errors: [...step.errors, message],
              finishedAt: new Date().toISOString(),
            }
            current = {
              ...current,
              steps: current.steps.map((s, idx) => (idx === i ? step : s)),
              cursor: i,
            }
            setRun({ ...current, runState: 'failed' })
            runningRef.current = false
            return
          }
        }

        setRun({ ...current, runState: 'completed', cursor: current.steps.length })
      } finally {
        runningRef.current = false
      }
    },
    [gameFolders, prepareStep],
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
      idx === i ? { ...s, status: 'skipped' as const } : s,
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
          status: 'pending',
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
      cacheRef.current = new Map()
      await executeFromCursor({ ...next, runState: 'running' })
    },
    [run, markAlreadyInstalledFromLog, executeFromCursor],
  )

  const sendInput = useCallback(async (text: string) => {
    await sendWeiduStdin(text)
    setInputPrompt(null)
  }, [])

  return {
    run,
    planSteps,
    consoleLines,
    inputPrompt,
    paused,
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
