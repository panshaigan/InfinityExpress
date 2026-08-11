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
import { consoleLineTone } from '../lib/install/consoleLineHighlight'
import { formatConsoleTs } from '../lib/install/formatConsoleTs'
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

function stampLine(text: string): string {
  return `${formatConsoleTs()} ${text}`
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
  const [commandLines, setCommandLines] = useState<string[]>([])
  const [resultLines, setResultLines] = useState<string[]>([])
  const [inputPrompt, setInputPrompt] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const cacheRef = useRef<ModListingCache>(new Map())
  const runningRef = useRef(false)
  const pausedRef = useRef(false)
  const activeStepIdRef = useRef<string | null>(null)
  /** Live WeiDU highlight lines per step; survives executeFromCursor setRun overwrites. */
  const stepResultLinesRef = useRef<Map<string, string[]>>(new Map())

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    activeStepIdRef.current = activeStepId
  }, [activeStepId])

  const rememberStepResult = useCallback((stepId: string, stamped: string) => {
    const map = stepResultLinesRef.current
    const prev = map.get(stepId) ?? []
    map.set(stepId, [...prev, stamped])
  }, [])

  const mergeStepResultLines = useCallback((step: InstallStep): InstallStep => {
    const fromRef = stepResultLinesRef.current.get(step.stepId)
    if (!fromRef || fromRef.length === 0) return step
    if (step.resultLines.length >= fromRef.length) return step
    return { ...step, resultLines: fromRef }
  }, [])

  const withMergedResults = useCallback(
    (steps: InstallStep[]): InstallStep[] => steps.map(mergeStepResultLines),
    [mergeStepResultLines],
  )

  const planSteps = useMemo(() => {
    if (!game) return []
    return buildInstallPlan(model, selectedIds, game)
  }, [model, selectedIds, game])

  /** Append to WeiDU (+ Results if highlighted). Returns stamped line for callers that track per-step results. */
  const pushConsoleLine = useCallback((text: string): string => {
    const stamped = stampLine(text)
    setConsoleLines((prev) => [...prev.slice(-4999), stamped])
    if (consoleLineTone(text) != null) {
      setResultLines((prev) => [...prev.slice(-999), stamped])
    }
    return stamped
  }, [])

  const pushConsoleLines = useCallback(
    (texts: string[]) => {
      for (const text of texts) pushConsoleLine(text)
    },
    [pushConsoleLine],
  )

  const appendStepResultIfHighlighted = (
    step: InstallStep,
    stamped: string,
    rawText: string,
  ): InstallStep => {
    if (consoleLineTone(rawText) == null) return step
    rememberStepResult(step.stepId, stamped)
    return { ...step, resultLines: [...step.resultLines, stamped] }
  }

  const appendCommandLine = useCallback((message: string) => {
    setCommandLines((prev) => [...prev.slice(-999), stampLine(message)])
  }, [])

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
      resultLines: s.resultLines ?? [],
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
    setCommandLines([])
    setResultLines([])
    setInputPrompt(null)
    setPaused(false)
    setActiveStepId(null)
    cacheRef.current = new Map()
    stepResultLinesRef.current = new Map()
    return next
  }, [game, planSteps])

  useEffect(() => {
    let cancelled = false
    let unlisten: { current?: () => void } = {}
    void listenWeiduInstallEvents((ev: WeiduInstallEvent) => {
      if (ev.kind === 'output') {
        const stamped = stampLine(ev.text)
        setConsoleLines((prev) => [...prev.slice(-4999), stamped])
        if (consoleLineTone(ev.text) != null) {
          setResultLines((prev) => [...prev.slice(-999), stamped])
          const stepId = activeStepIdRef.current
          if (stepId) {
            rememberStepResult(stepId, stamped)
            setRun((r) => {
              if (!r) return r
              return {
                ...r,
                steps: r.steps.map((s) =>
                  s.stepId === stepId
                    ? { ...s, resultLines: [...s.resultLines, stamped] }
                    : s,
                ),
              }
            })
          }
        }
      } else if (ev.kind === 'commandLogged') {
        setCommandLines((prev) => [...prev.slice(-999), stampLine(ev.command)])
      } else if (ev.kind === 'inputRequired') {
        setInputPrompt(ev.prompt)
        setRun((r) => (r ? { ...r, runState: 'waitingForInput' } : r))
      } else if (ev.kind === 'classified') {
        const text = `[${ev.level}] ${ev.message}`
        const stamped = stampLine(text)
        setConsoleLines((prev) => [...prev.slice(-4999), stamped])
        if (consoleLineTone(text) != null) {
          setResultLines((prev) => [...prev.slice(-999), stamped])
          const stepId = activeStepIdRef.current
          if (stepId) {
            rememberStepResult(stepId, stamped)
            setRun((r) => {
              if (!r) return r
              return {
                ...r,
                steps: r.steps.map((s) =>
                  s.stepId === stepId
                    ? { ...s, resultLines: [...s.resultLines, stamped] }
                    : s,
                ),
              }
            })
          }
        }
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
  }, [rememberStepResult])

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
        const stamped = stampLine(`[stage] ${payload.message}`)
        setConsoleLines((prev) => [...prev.slice(-4999), stamped])
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
    async (steps: InstallStep[], game: SelectedGame): Promise<InstallStep[]> => {
      const logsByDir = new Map<string, string>()
      async function logFor(dir: string): Promise<string> {
        if (!dir) return ''
        const cached = logsByDir.get(dir)
        if (cached != null) return cached
        const text = await readGameWeiduLog(dir)
        logsByDir.set(dir, text)
        return text
      }

      const out: InstallStep[] = []
      for (const step of steps) {
        if (step.languageIndex == null || step.weiduNumbers.length === 0) {
          out.push(step)
          continue
        }
        const gameDir = gameDirForPhase(game, step.phase, gameFolders)
        const log = await logFor(gameDir)
        if (!log.trim()) {
          out.push(step)
          continue
        }
        const allInstalled = step.weiduNumbers.every((n) =>
          isComponentInstalledInLog(log, step.tp2Path, step.languageIndex!, n),
        )
        if (allInstalled && (step.status === 'queued' || step.status === 'copying')) {
          out.push({ ...step, status: 'alreadyInstalled', progress: null })
        } else {
          out.push(step)
        }
      }
      return out
    },
    [gameFolders],
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
              steps: withMergedResults(
                current.steps.map((s, idx) => (idx === i ? step : s)),
              ),
              cursor: i,
            }
            setRun({ ...current, runState: 'running' })
            pushConsoleLine(
              `[stage] Resolving ${step.modId} for ${gameDir || '(no game dir)'}…`,
            )

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
              pushConsoleLines([
                `[stage] Copied ${step.modId} → ${gameDir}/${resolved.stagedFolderName}`,
                `[stage] tp2: ${resolved.tp2Path}`,
              ])
            } else {
              pushConsoleLine(
                `[stage] Reusing staged ${resolved.stagedFolderName} (${resolved.tp2Path})`,
              )
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

            if (weiduNumbers.length === step.componentIds.length && errors.length === 0) {
              const mapping = step.componentIds
                .map((id, idx) => `${id}→${weiduNumbers[idx]}`)
                .join(', ')
              pushConsoleLine(
                `[resolve] ${resolved.stagedFolderName} (xml modId=${step.modId}): ${mapping}`,
              )
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
              for (const err of errors) {
                const stamped = pushConsoleLine(`[error] ${err}`)
                step = appendStepResultIfHighlighted(step, stamped, `[error] ${err}`)
              }
              if (errors.length === 0) {
                const raw =
                  `[error] Could not resolve all WeiDU component numbers for ${step.modId}`
                const stamped = pushConsoleLine(raw)
                step = appendStepResultIfHighlighted(step, stamped, raw)
              }
              current = {
                ...current,
                steps: withMergedResults(
                  current.steps.map((s, idx) => (idx === i ? step : s)),
                ),
                cursor: i,
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
              steps: withMergedResults(
                current.steps.map((s, idx) => (idx === i ? step : s)),
              ),
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
                steps: withMergedResults(
                  current.steps.map((s, idx) => (idx === i ? step : s)),
                ),
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

            step = mergeStepResultLines({
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
            })

            current = {
              ...current,
              steps: withMergedResults(
                current.steps.map((s, idx) => (idx === i ? step : s)),
              ),
              cursor: i + 1,
            }
            setRun({ ...current, runState: status === 'failed' ? 'failed' : 'running' })

            if (status === 'failed') {
              runningRef.current = false
              return
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            const raw = `[error] ${message}`
            const stamped = pushConsoleLine(raw)
            step = {
              ...appendStepResultIfHighlighted(step, stamped, raw),
              status: 'failed',
              progress: null,
              errors: [...step.errors, message],
              finishedAt: new Date().toISOString(),
            }
            current = {
              ...current,
              steps: withMergedResults(
                current.steps.map((s, idx) => (idx === i ? step : s)),
              ),
              cursor: i,
            }
            setActiveStepId(step.stepId)
            setRun({ ...current, runState: 'failed' })
            runningRef.current = false
            return
          }
        }

        setActiveStepId(null)
        setRun({
          ...current,
          steps: withMergedResults(current.steps),
          runState: 'completed',
          cursor: current.steps.length,
        })
      } finally {
        runningRef.current = false
      }
    },
    [
      gameFolders,
      model.componentsById,
      pushConsoleLine,
      pushConsoleLines,
      mergeStepResultLines,
      withMergedResults,
    ],
  )

  const start = useCallback(async () => {
    const next = initRun() ?? run
    if (!next) return
    appendCommandLine('Installation started')
    await executeFromCursor(next)
  }, [initRun, run, executeFromCursor, appendCommandLine])

  const continueRun = useCallback(async () => {
    if (!run) return
    setPaused(false)
    setInputPrompt(null)
    appendCommandLine('Installation resumed')
    await executeFromCursor({ ...run, runState: 'running' })
  }, [run, executeFromCursor, appendCommandLine])

  const pause = useCallback(() => {
    setPaused(true)
    setRun((r) => (r ? { ...r, runState: 'paused' } : r))
    appendCommandLine('Installation paused')
  }, [appendCommandLine])

  const stop = useCallback(async () => {
    await cancelWeiduStep()
    setRun((r) => (r ? { ...r, runState: 'paused' } : r))
    appendCommandLine('Installation stopped')
  }, [appendCommandLine])

  const skipCurrent = useCallback(async () => {
    if (!run) return
    const i = run.cursor
    const step = run.steps[i]
    const label = step
      ? `${step.modId}${step.componentIds[0] ? ` (${step.componentIds[0]})` : ''}`
      : 'current step'
    const steps = run.steps.map((s, idx) =>
      idx === i ? { ...s, status: 'skipped' as const, progress: null } : s,
    )
    const next = { ...run, steps, cursor: i + 1, runState: 'running' as InstallRunState }
    setRun(next)
    setInputPrompt(null)
    appendCommandLine(`Step skipped: ${label}`)
    await executeFromCursor(next)
  }, [run, executeFromCursor, appendCommandLine])

  const restartFromBackup = useCallback(
    async (_phaseGameDir: string) => {
      if (!run) return
      let steps: InstallStep[] = run.steps.map(
        (s): InstallStep => ({
          ...s,
          status: 'queued',
          progress: null,
          warnings: [],
          errors: [],
          resultLines: [],
          finishedAt: undefined,
          startedAt: undefined,
        }),
      )
      steps = await markAlreadyInstalledFromLog(steps, run.game)
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
      setResultLines([])
      setInputPrompt(null)
      setActiveStepId(null)
      cacheRef.current = new Map()
      stepResultLinesRef.current = new Map()
      appendCommandLine('Restarted installation after backup restore')
      await executeFromCursor({ ...next, runState: 'running' })
    },
    [run, markAlreadyInstalledFromLog, executeFromCursor, appendCommandLine],
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
    commandLines,
    resultLines,
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
    appendCommandLine,
    setRun,
  }
}
