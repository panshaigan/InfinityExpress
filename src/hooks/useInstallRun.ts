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
import {
  canSetBreakpoint,
  isStepDone,
  nextActionableCursor,
  stepIndexById,
} from '../lib/install/cursor'
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
  runWeiduForceUninstall,
  runWeiduStep,
  sendWeiduStdin,
} from '../lib/desktop/weiduInstall'
import { isComponentInstalledInLog } from '../lib/install/weiduLog'
import { loadInstallConsoleFromRunLog } from '../lib/install/loadRunConsole'
import type { PersistedInstallSession } from '../lib/ui/appSessionPrefs'

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

export interface InstallRunInitialState {
  installSession: PersistedInstallSession
}

export function useInstallRun(options: {
  model: InstallSequenceModel
  selectedIds: ReadonlySet<string>
  game: SelectedGame | null
  gameFolders: GameFolderPaths
  initialInstallState?: InstallRunInitialState | null
}) {
  const { model, selectedIds, game, gameFolders, initialInstallState } = options
  const shouldLoadConsoleRef = useRef(!!initialInstallState?.installSession)
  const hydratedRef = useRef(false)
  const [run, setRun] = useState<InstallRun | null>(() => {
    const session = initialInstallState?.installSession
    return session?.run ?? null
  })
  const [consoleLines, setConsoleLines] = useState<string[]>([])
  const [commandLines, setCommandLines] = useState<string[]>([])
  const [resultLines, setResultLines] = useState<string[]>([])
  const [inputPrompt, setInputPrompt] = useState<string | null>(null)
  const [paused, setPaused] = useState(
    () => initialInstallState?.installSession.transport.paused ?? false,
  )
  const [pausePending, setPausePending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [goingPrevious, setGoingPrevious] = useState(false)
  const [activeStepId, setActiveStepId] = useState<string | null>(() => {
    const session = initialInstallState?.installSession
    if (!session) return null
    const step = session.run.steps[session.run.cursor]
    return step?.stepId ?? session.run.steps[0]?.stepId ?? null
  })
  const cacheRef = useRef<ModListingCache>(new Map())
  const runningRef = useRef(false)
  const pausedRef = useRef(false)
  const pausePendingRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const activeStepIdRef = useRef<string | null>(null)
  const runRef = useRef<InstallRun | null>(null)
  /** Skip-to-step requested while running; applied between steps. */
  const pendingCursorStepIdRef = useRef<string | null>(null)
  /** Live WeiDU highlight lines per step; survives executeFromCursor setRun overwrites. */
  const stepResultLinesRef = useRef<Map<string, string[]>>(new Map())

  if (!hydratedRef.current && initialInstallState?.installSession) {
    hydratedRef.current = true
    pausedRef.current = initialInstallState.installSession.transport.paused
    for (const step of initialInstallState.installSession.run.steps) {
      if (step.resultLines.length > 0) {
        stepResultLinesRef.current.set(step.stepId, [...step.resultLines])
      }
    }
  }

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    activeStepIdRef.current = activeStepId
  }, [activeStepId])

  useEffect(() => {
    runRef.current = run
  }, [run])

  useEffect(() => {
    if (!shouldLoadConsoleRef.current) return
    const logDir = run?.logDir
    if (!logDir) return
    shouldLoadConsoleRef.current = false
    let cancelled = false
    void loadInstallConsoleFromRunLog(logDir).then((loaded) => {
      if (cancelled) return
      if (loaded.consoleLines.length === 0) return
      setConsoleLines(loaded.consoleLines)
      setResultLines(loaded.resultLines)
    })
    return () => {
      cancelled = true
    }
  }, [run?.logDir, run?.runId])

  /** Install cursor step id for table highlight (`InstallRun.cursor`). */
  const cursorStepId = useMemo(() => {
    if (!run) return null
    const step = run.steps[run.cursor]
    return step?.stepId ?? null
  }, [run])

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
      breakpointStepIds: [],
      logDir,
    }
    setRun(next)
    runRef.current = next
    setConsoleLines([])
    setCommandLines([])
    setResultLines([])
    setInputPrompt(null)
    setPaused(false)
    pausedRef.current = false
    setPausePending(false)
    pausePendingRef.current = false
    stopRequestedRef.current = false
    setStopping(false)
    // Cursor is 0 — first package is highlighted immediately on Start.
    setActiveStepId(steps[0]?.stepId ?? null)
    cacheRef.current = new Map()
    stepResultLinesRef.current = new Map()
    return next
  }, [game, planSteps])

  const ensureIdleRun = useCallback((): InstallRun | null => {
    if (runRef.current) return runRef.current
    return initRun()
  }, [initRun])

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

  const withNormalizedCursor = useCallback((current: InstallRun): InstallRun => {
    const cursor = nextActionableCursor(current.steps, current.cursor)
    const step = current.steps[cursor]
    setActiveStepId(step?.stepId ?? current.steps[current.cursor]?.stepId ?? null)
    return { ...current, cursor }
  }, [])

  const ensureStepResolvedForUninstall = useCallback(
    async (current: InstallRun, index: number): Promise<InstallStep> => {
      let step = current.steps[index]!
      if (step.tp2Path && step.weiduNumbers.length > 0) return step

      const gameDir = gameDirForPhase(current.game, step.phase, gameFolders)
      const weiduPath = readWeiduPath()
      const appDirs = readAppDirPaths()
      const gameVersion =
        readGameFolderVersions()[gameFolderKeyForPhase(current.game, step.phase)] ?? ''
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

      const weiduNumbers: number[] = []
      for (const id of step.componentIds) {
        const r = resolved.componentResults.get(id)
        if (r?.weiduNumber != null) weiduNumbers.push(r.weiduNumber)
      }

      return {
        ...step,
        tp2Path: resolved.tp2Path,
        stagedFolderName: resolved.stagedFolderName,
        weiduNumbers,
        languageIndex: resolved.languageIndex,
      }
    },
    [gameFolders, model.componentsById],
  )

  const uninstallStepAtIndex = useCallback(
    async (current: InstallRun, index: number): Promise<InstallStep> => {
      const gameDir = gameDirForPhase(
        current.game,
        current.steps[index]!.phase,
        gameFolders,
      )
      let step = await ensureStepResolvedForUninstall(current, index)

      if (step.weiduNumbers.length > 0 && step.tp2Path && gameDir) {
        try {
          pushConsoleLine(
            `[uninstall] ${step.modId} (${step.weiduNumbers.join(', ')})…`,
          )
          await runWeiduForceUninstall({
            weiduPath: readWeiduPath(),
            tp2Path: step.tp2Path,
            gameDir,
            componentNumbers: step.weiduNumbers,
            languageIndex: step.languageIndex ?? 0,
          })
          pushConsoleLine(`[uninstall] Finished ${step.modId}`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          pushConsoleLine(`[error] Uninstall failed: ${message}`)
        }
      }

      return {
        ...mergeStepResultLines(step),
        status: 'queued',
        progress: null,
        errors: [],
        warnings: [],
        finishedAt: undefined,
        startedAt: undefined,
      }
    },
    [ensureStepResolvedForUninstall, gameFolders, mergeStepResultLines, pushConsoleLine],
  )

  const applyStoppedAtCursor = useCallback(
    async (
      current: InstallRun,
      index: number,
      step: InstallStep,
      gameDir: string,
    ): Promise<InstallRun> => {
      if (step.weiduNumbers.length > 0 && step.tp2Path && gameDir) {
        try {
          pushConsoleLine(
            `[stop] Force-uninstall ${step.modId} (${step.weiduNumbers.join(', ')})…`,
          )
          await runWeiduForceUninstall({
            weiduPath: readWeiduPath(),
            tp2Path: step.tp2Path,
            gameDir,
            componentNumbers: step.weiduNumbers,
            languageIndex: step.languageIndex ?? 0,
          })
          pushConsoleLine(`[stop] Force-uninstall finished for ${step.modId}`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          pushConsoleLine(`[error] Force-uninstall failed: ${message}`)
        }
      }

      const stoppedAt = new Date().toISOString()
      const reset: InstallStep = {
        ...mergeStepResultLines(step),
        status: 'queued',
        progress: null,
        errors: [],
        finishedAt: step.startedAt ? stoppedAt : undefined,
      }
      const next: InstallRun = {
        ...current,
        steps: withMergedResults(
          current.steps.map((s, idx) => (idx === index ? reset : s)),
        ),
        cursor: index,
        runState: 'stopped',
      }
      setRun(next)
      setActiveStepId(reset.stepId)
      setPaused(false)
      pausedRef.current = false
      setPausePending(false)
      pausePendingRef.current = false
      stopRequestedRef.current = false
      setStopping(false)
      appendCommandLine('Installation stopped')
      return next
    },
    [appendCommandLine, mergeStepResultLines, pushConsoleLine, withMergedResults],
  )

  const finishStepIteration = useCallback(
    (
      current: InstallRun,
      index: number,
      step: InstallStep,
      failed: boolean,
    ): { current: InstallRun; shouldExit: boolean } => {
      let next: InstallRun = {
        ...current,
        steps: withMergedResults(
          current.steps.map((s, idx) => (idx === index ? step : s)),
        ),
        cursor: index + 1,
      }
      next = withNormalizedCursor(next)

      if (failed) {
        setRun({ ...next, runState: 'failed' })
        return { current: next, shouldExit: true }
      }

      if (pausePendingRef.current) {
        pausePendingRef.current = false
        pausedRef.current = true
        setPausePending(false)
        setPaused(true)
        setRun({ ...next, runState: 'paused' })
        appendCommandLine('Installation paused')
        return { current: next, shouldExit: false }
      }

      setRun({ ...next, runState: 'running' })
      return { current: next, shouldExit: false }
    },
    [appendCommandLine, withMergedResults, withNormalizedCursor],
  )

  const executeFromCursor = useCallback(
    async (startRun: InstallRun) => {
      if (runningRef.current) return
      runningRef.current = true
      stopRequestedRef.current = false
      let current = startRun
      setRun({ ...current, runState: 'running' })

      try {
        for (let i = current.cursor; i < current.steps.length; i++) {
          const pendingStepId = pendingCursorStepIdRef.current
          if (pendingStepId) {
            const pendingIdx = stepIndexById(current.steps, pendingStepId)
            pendingCursorStepIdRef.current = null
            if (pendingIdx >= 0 && pendingIdx !== i) {
              i = pendingIdx - 1
              current = withNormalizedCursor({ ...current, cursor: pendingIdx })
              setRun(current)
              continue
            }
          }

          while (pausedRef.current) {
            if (stopRequestedRef.current) {
              const step = current.steps[i]!
              const gameDir = gameDirForPhase(current.game, step.phase, gameFolders)
              await applyStoppedAtCursor(current, i, step, gameDir)
              runningRef.current = false
              return
            }
            await new Promise((r) => setTimeout(r, 200))
          }

          if (stopRequestedRef.current) {
            const step = current.steps[i]!
            const gameDir = gameDirForPhase(current.game, step.phase, gameFolders)
            await applyStoppedAtCursor(current, i, step, gameDir)
            runningRef.current = false
            return
          }

          let step = current.steps[i]!
          if (
            step.status === 'succeeded' ||
            step.status === 'alreadyInstalled' ||
            step.status === 'skipped'
          ) {
            continue
          }

          if (current.breakpointStepIds.includes(step.stepId)) {
            const halted = withNormalizedCursor({
              ...current,
              cursor: i,
              runState: 'paused',
            })
            pausedRef.current = true
            pausePendingRef.current = false
            setPausePending(false)
            setPaused(true)
            setRun(halted)
            appendCommandLine(`Breakpoint hit: ${step.modId}`)
            runningRef.current = false
            return
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

            if (stopRequestedRef.current) {
              step = {
                ...step,
                tp2Path: resolved.tp2Path,
                stagedFolderName: resolved.stagedFolderName,
                languageIndex: resolved.languageIndex,
              }
              await applyStoppedAtCursor(current, i, step, gameDir)
              runningRef.current = false
              return
            }

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
              const finished = finishStepIteration(current, i, step, false)
              current = finished.current
              if (finished.shouldExit) {
                runningRef.current = false
                return
              }
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

            if (stopRequestedRef.current) {
              await applyStoppedAtCursor(current, i, step, gameDir)
              runningRef.current = false
              return
            }

            // User cancel (not timeout): same cleanup path as Stop.
            if (result.cancelled && !result.timedOut) {
              await applyStoppedAtCursor(current, i, step, gameDir)
              runningRef.current = false
              return
            }

            let status: InstallStep['status'] = 'failed'
            if (result.timedOut) status = 'failed'
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

            const finished = finishStepIteration(current, i, step, status === 'failed')
            current = finished.current
            if (finished.shouldExit) {
              runningRef.current = false
              return
            }
          } catch (err) {
            if (stopRequestedRef.current) {
              const gameDir = gameDirForPhase(
                current.game,
                step.phase,
                gameFolders,
              )
              await applyStoppedAtCursor(current, i, step, gameDir)
              runningRef.current = false
              return
            }
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
      applyStoppedAtCursor,
      gameFolders,
      model.componentsById,
      pushConsoleLine,
      pushConsoleLines,
      mergeStepResultLines,
      withMergedResults,
      withNormalizedCursor,
      appendCommandLine,
      finishStepIteration,
    ],
  )

  const start = useCallback(
    async (seed?: InstallRun | null) => {
      const next = seed ?? initRun()
      if (!next) return
      appendCommandLine('Installation started')
      await executeFromCursor(next)
    },
    [initRun, executeFromCursor, appendCommandLine],
  )

  const continueRun = useCallback(async () => {
    const current = runRef.current
    if (!current) return
    pausedRef.current = false
    pausePendingRef.current = false
    setPaused(false)
    setPausePending(false)
    stopRequestedRef.current = false
    setInputPrompt(null)
    appendCommandLine('Installation resumed')
    await executeFromCursor({ ...current, runState: 'running' })
  }, [executeFromCursor, appendCommandLine])

  const pause = useCallback(() => {
    const current = runRef.current
    if (!current) return

    if (current.runState === 'running') {
      if (pausePendingRef.current) {
        pausePendingRef.current = false
        setPausePending(false)
        appendCommandLine('Pause cancelled')
        return
      }
      pausePendingRef.current = true
      setPausePending(true)
      appendCommandLine('Pause after current step')
      return
    }

    if (current.runState === 'paused') {
      void continueRun()
    }
  }, [appendCommandLine, continueRun])

  const stop = useCallback(async () => {
    stopRequestedRef.current = true
    pausePendingRef.current = false
    setPausePending(false)
    pausedRef.current = true
    setStopping(true)
    await cancelWeiduStep()
    appendCommandLine('Stop requested — waiting for WeiDU to exit…')

    // waitingForInput / already-idle runner: finalize immediately (no in-flight loop).
    if (!runningRef.current) {
      const current = runRef.current
      if (!current) {
        setStopping(false)
        return
      }
      const i = current.cursor
      const step = current.steps[i]
      if (!step) {
        setRun({ ...current, runState: 'stopped' })
        setPaused(false)
        pausedRef.current = false
        stopRequestedRef.current = false
        setStopping(false)
        appendCommandLine('Installation stopped')
        return
      }
      const gameDir = gameDirForPhase(current.game, step.phase, gameFolders)
      await applyStoppedAtCursor(current, i, step, gameDir)
    }
  }, [appendCommandLine, applyStoppedAtCursor, gameFolders])

  const skipCurrent = useCallback(() => {
    const current = runRef.current
    if (!current) return
    const halt =
      current.runState === 'paused' ||
      current.runState === 'stopped' ||
      current.runState === 'waitingForInput'
    if (!halt) return

    const i = current.cursor
    const step = current.steps[i]
    if (!step) return
    if (
      step.status === 'succeeded' ||
      step.status === 'alreadyInstalled' ||
      step.status === 'skipped'
    ) {
      return
    }

    setSkipping(true)
    try {
      const label = `${step.modId}${step.componentIds[0] ? ` (${step.componentIds[0]})` : ''}`
      const steps = current.steps.map((s, idx) =>
        idx === i ? { ...s, status: 'skipped' as const, progress: null } : s,
      )
      const nextCursor = nextActionableCursor(steps, i + 1)
      const keepState: InstallRunState =
        current.runState === 'waitingForInput' ? 'stopped' : current.runState
      const next: InstallRun = withNormalizedCursor({
        ...current,
        steps,
        cursor: nextCursor,
        runState: keepState,
      })
      setRun(next)
      setActiveStepId(next.steps[next.cursor]?.stepId ?? null)
      setInputPrompt(null)
      appendCommandLine(`Step skipped: ${label}`)
    } finally {
      setSkipping(false)
    }
  }, [appendCommandLine, withNormalizedCursor])

  const goToPreviousStep = useCallback(async () => {
    const current = runRef.current
    if (!current) return false
    if (current.runState !== 'paused' && current.runState !== 'stopped') return false

    const prev = current.cursor - 1
    if (prev < 0) return false

    setGoingPrevious(true)
    try {
      let steps = [...current.steps]
      const reset = await uninstallStepAtIndex(current, prev)
      steps[prev] = reset

      const next = withNormalizedCursor({
        ...current,
        steps: withMergedResults(steps),
        cursor: prev,
        runState: current.runState,
      })
      setRun(next)
      setActiveStepId(reset.stepId)
      appendCommandLine(`Moved back to ${reset.modId}`)
      return true
    } finally {
      setGoingPrevious(false)
    }
  }, [appendCommandLine, uninstallStepAtIndex, withMergedResults, withNormalizedCursor])

  const uninstallBackToStep = useCallback(
    async (targetStepId: string) => {
      const current = runRef.current
      if (!current) return false
      if (current.runState !== 'paused' && current.runState !== 'stopped') return false

      const targetIdx = stepIndexById(current.steps, targetStepId)
      if (targetIdx < 0) return false
      if (targetIdx >= current.cursor) return false

      let steps = [...current.steps]
      for (let i = current.cursor - 1; i >= targetIdx; i--) {
        const step = steps[i]!
        if (isStepDone(step.status)) continue
        steps[i] = await uninstallStepAtIndex({ ...current, steps }, i)
      }

      const next = withNormalizedCursor({
        ...current,
        steps: withMergedResults(steps),
        cursor: targetIdx,
        runState: current.runState,
      })
      setRun(next)
      setActiveStepId(steps[targetIdx]?.stepId ?? null)
      appendCommandLine(`Uninstalled back to ${steps[targetIdx]?.modId ?? 'step'}`)
      return true
    },
    [appendCommandLine, uninstallStepAtIndex, withMergedResults, withNormalizedCursor],
  )

  const toggleBreakpoint = useCallback((stepId: string) => {
    const current = ensureIdleRun()
    if (!current) return
    const idx = stepIndexById(current.steps, stepId)
    if (idx < 0) return
    const step = current.steps[idx]!
    if (!canSetBreakpoint(step, idx, current.cursor, current.runState)) return
    const has = current.breakpointStepIds.includes(stepId)
    const breakpointStepIds = has
      ? current.breakpointStepIds.filter((id) => id !== stepId)
      : [...current.breakpointStepIds, stepId]
    const next = { ...current, breakpointStepIds }
    setRun(next)
    runRef.current = next
    appendCommandLine(
      has ? `Breakpoint removed: ${step.modId}` : `Breakpoint set: ${step.modId}`,
    )
  }, [appendCommandLine, ensureIdleRun])

  const moveCursorToStep = useCallback(
    (targetStepId: string) => {
      const current = runRef.current ?? ensureIdleRun()
      if (!current) return false

      const targetIdx = stepIndexById(current.steps, targetStepId)
      if (targetIdx < 0) return false

      const targetStep = current.steps[targetIdx]
      if (!targetStep || isStepDone(targetStep.status)) return false

      if (current.runState === 'running' || current.runState === 'waitingForInput') {
        pendingCursorStepIdRef.current = targetStepId
        appendCommandLine(`Cursor will move to ${current.steps[targetIdx]?.modId} after current step`)
        return true
      }

      if (current.runState !== 'paused' && current.runState !== 'stopped') {
        return false
      }

      const next = withNormalizedCursor({
        ...current,
        cursor: targetIdx,
        runState: current.runState,
      })
      setRun(next)
      runRef.current = next
      setActiveStepId(targetStepId)
      appendCommandLine(`Cursor moved to ${current.steps[targetIdx]?.modId}`)
      return true
    },
    [appendCommandLine, ensureIdleRun, withNormalizedCursor],
  )

  const restartFromBackup = useCallback(
    async (_phaseGameDir: string) => {
      if (!runRef.current) return

      if (runningRef.current) {
        stopRequestedRef.current = true
        setPaused(true)
        await cancelWeiduStep()
        for (let n = 0; n < 200 && runningRef.current; n++) {
          await new Promise((r) => setTimeout(r, 100))
        }
      }

      const base = runRef.current
      if (!base) return

      let steps: InstallStep[] = base.steps.map(
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
      steps = await markAlreadyInstalledFromLog(steps, base.game)
      const cursor = steps.findIndex(
        (s) =>
          s.status !== 'succeeded' &&
          s.status !== 'alreadyInstalled' &&
          s.status !== 'skipped',
      )
      const nextCursor = cursor >= 0 ? cursor : 0
      const next: InstallRun = {
        ...base,
        steps,
        cursor: nextCursor,
        runState: 'idle',
        breakpointStepIds: base.breakpointStepIds ?? [],
      }
      setRun(next)
      setConsoleLines([])
      setResultLines([])
      setInputPrompt(null)
      setActiveStepId(steps[nextCursor]?.stepId ?? null)
      setPaused(false)
      pausedRef.current = false
      setPausePending(false)
      pausePendingRef.current = false
      stopRequestedRef.current = false
      setStopping(false)
      cacheRef.current = new Map()
      stepResultLinesRef.current = new Map()
      appendCommandLine('Plan reset after backup restore — press Play to continue')
    },
    [markAlreadyInstalledFromLog, appendCommandLine],
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
    pausePending,
    stopping,
    skipping,
    goingPrevious,
    activeStepId,
    cursorStepId,
    initRun,
    ensureIdleRun,
    start,
    continueRun,
    pause,
    stop,
    skipCurrent,
    goToPreviousStep,
    uninstallBackToStep,
    toggleBreakpoint,
    moveCursorToStep,
    restartFromBackup,
    sendInput,
    appendCommandLine,
    setRun,
    canGoPrevious: run
      ? run.cursor > 0 &&
        (run.runState === 'paused' || run.runState === 'stopped')
      : false,
  }
}
