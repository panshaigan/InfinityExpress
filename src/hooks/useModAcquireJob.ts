import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acquireMod,
  cancelModAcquire,
  listenModAcquireProgress,
  pendingToRemote,
  probeModRemote,
  remoteToPending,
  type ModAcquireProgress,
} from '../lib/desktop/modAcquire'
import { isDesktopApp } from '../lib/desktop/fsDialogs'
import {
  estimateAcquireTotal,
  modsNeedingAcquire,
  type PendingRemoteMeta,
} from '../lib/mods/acquireTargets'
import {
  effectiveModFields,
  formatBytes,
  type WorkingMod,
} from '../lib/mods/loadMods'
import { readGithubToken } from '../lib/ui/githubTokenPrefs'
import { readAppDirPaths } from '../lib/ui/appDirPrefs'

export type JobKind = 'check' | 'acquire'

export type JobEntryStatus =
  | 'pending'
  | 'running'
  | 'ok'
  | 'updated'
  | 'up_to_date'
  | 'failed'
  | 'skipped'

export interface JobLogEntry {
  codename: string
  status: JobEntryStatus
  message: string
}

export interface AcquireJobState {
  kind: JobKind
  running: boolean
  minimized: boolean
  open: boolean
  entries: JobLogEntry[]
  activeCodename: string | null
  progress: ModAcquireProgress | null
  doneCount: number
  totalCount: number
  summary: string | null
  rateLimitHint: boolean
}

const IDLE: AcquireJobState = {
  kind: 'check',
  running: false,
  minimized: false,
  open: false,
  entries: [],
  activeCodename: null,
  progress: null,
  doneCount: 0,
  totalCount: 0,
  summary: null,
  rateLimitHint: false,
}

export interface SizeConfirmState {
  targets: WorkingMod[]
  totalLabel: string
  detail: string
}

function isCancelledError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /cancell?ed/i.test(message)
}

function markRemainingSkipped(entries: JobLogEntry[]): JobLogEntry[] {
  return entries.map((e) =>
    e.status === 'pending' || e.status === 'running'
      ? { ...e, status: 'skipped', message: 'Cancelled' }
      : e,
  )
}

export function useModAcquireJob(args: {
  mods: WorkingMod[]
  patchDiskStatus: (
    codename: string,
    diskStatus: WorkingMod['diskStatus'],
  ) => void
  applyAcquireSuccess: (
    codename: string,
    overlays: { version: string; release: string; sizeBytes: number | null },
    meta?: { author?: string | null },
  ) => void
  refreshDiskStatus: () => Promise<void>
  clearSelection?: (codename: string) => void
  onMissingDownloadDir?: () => void
  onJobFinished?: (result: {
    tone: 'success' | 'error'
    message: string
  }) => void
}) {
  const {
    mods,
    patchDiskStatus,
    applyAcquireSuccess,
    refreshDiskStatus,
    clearSelection,
    onMissingDownloadDir,
    onJobFinished,
  } = args
  const [job, setJob] = useState<AcquireJobState>(IDLE)
  const [pendingRemotes, setPendingRemotes] = useState<
    Map<string, PendingRemoteMeta>
  >(() => new Map())
  const [sizeConfirm, setSizeConfirm] = useState<SizeConfirmState | null>(null)
  const pendingRemotesRef = useRef(pendingRemotes)
  pendingRemotesRef.current = pendingRemotes
  const modsRef = useRef(mods)
  modsRef.current = mods
  const cancelRef = useRef(false)
  const clearSelectionRef = useRef(clearSelection)
  clearSelectionRef.current = clearSelection
  const onMissingDownloadDirRef = useRef(onMissingDownloadDir)
  onMissingDownloadDirRef.current = onMissingDownloadDir
  const onJobFinishedRef = useRef(onJobFinished)
  onJobFinishedRef.current = onJobFinished

  const notifyFinished = useCallback(
    (tone: 'success' | 'error', message: string) => {
      onJobFinishedRef.current?.({ tone, message })
    },
    [],
  )

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listenModAcquireProgress((payload) => {
      setJob((prev) =>
        prev.running
          ? { ...prev, activeCodename: payload.codename, progress: payload }
          : prev,
      )
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  const setEntry = useCallback(
    (codename: string, status: JobEntryStatus, message: string) => {
      setJob((prev) => {
        const entries = prev.entries.map((e) =>
          e.codename === codename ? { ...e, status, message } : e,
        )
        return { ...prev, entries }
      })
    },
    [],
  )

  const minimizeJob = useCallback(() => {
    setJob((prev) => (prev.running ? { ...prev, minimized: true, open: false } : prev))
  }, [])

  const restoreJob = useCallback(() => {
    setJob((prev) => ({ ...prev, minimized: false, open: true }))
  }, [])

  const dismissJob = useCallback(() => {
    if (job.running) {
      minimizeJob()
      return
    }
    setJob(IDLE)
  }, [job.running, minimizeJob])

  const cancelJob = useCallback(() => {
    if (!cancelRef.current) {
      cancelRef.current = true
      void cancelModAcquire()
    }
  }, [])

  const finishCancelled = useCallback(
    async (kind: JobKind) => {
      const summary =
        kind === 'check' ? 'Check cancelled' : 'Download cancelled'
      setJob((prev) => ({
        ...prev,
        running: false,
        activeCodename: null,
        progress: null,
        entries: markRemainingSkipped(prev.entries),
        summary,
      }))
      notifyFinished('success', summary)
      if (kind === 'acquire') {
        await refreshDiskStatus()
      }
    },
    [notifyFinished, refreshDiskStatus],
  )

  const runCheck = useCallback(
    async (codenames: string[]) => {
      if (codenames.length === 0) return
      if (!isDesktopApp()) {
        const summary = 'Desktop app required'
        setJob({
          ...IDLE,
          open: true,
          kind: 'check',
          entries: [
            {
              codename: '—',
              status: 'failed',
              message: 'Checking for updates requires the desktop app.',
            },
          ],
          totalCount: 1,
          doneCount: 1,
          summary,
        })
        notifyFinished('error', summary)
        return
      }

      cancelRef.current = false
      const token = readGithubToken()
      const targets = modsRef.current.filter((m) => codenames.includes(m.codename))
      setJob({
        kind: 'check',
        running: true,
        minimized: false,
        open: true,
        entries: targets.map((m) => ({
          codename: m.codename,
          status: 'pending',
          message: 'Queued',
        })),
        activeCodename: null,
        progress: null,
        doneCount: 0,
        totalCount: targets.length,
        summary: null,
        rateLimitHint: false,
      })

      let rateLimitHint = false
      let updated = 0
      let available = 0
      let upToDate = 0
      let failed = 0
      const nextPending = new Map(pendingRemotesRef.current)

      for (const mod of targets) {
        if (cancelRef.current) break
        setJob((prev) => ({
          ...prev,
          activeCodename: mod.codename,
          progress: null,
        }))
        setEntry(mod.codename, 'running', 'Probing remote…')
        try {
          const remote = await probeModRemote(
            {
              codename: mod.codename,
              url: mod.url,
              track: mod.track,
              download: mod.download,
              catalogSizeBytes: effectiveModFields(mod).sizeBytes,
            },
            token,
          )
          if (cancelRef.current) {
            setEntry(mod.codename, 'skipped', 'Cancelled')
            break
          }
          if (remote.rateLimited || remote.usedScrapeFallback) {
            rateLimitHint = true
          }
          let pending = remoteToPending(remote)
          const catalogSize = effectiveModFields(mod).sizeBytes
          if (pending.sizeBytes == null && catalogSize != null) {
            pending = {
              ...pending,
              sizeBytes: catalogSize,
              sizeIsEstimate: true,
            }
          }
          nextPending.set(mod.codename, pending)

          const localVersion = effectiveModFields(mod).version
          const onDisk =
            mod.diskStatus === 'present' ||
            mod.diskStatus === 'update_available' ||
            mod.diskStatus === 'busy'

          if (!onDisk || mod.diskStatus === 'not_present') {
            patchDiskStatus(mod.codename, 'not_present')
            setEntry(
              mod.codename,
              'ok',
              `Remote ${remote.version} (N/A)`,
            )
            available += 1
          } else if (remote.version !== localVersion) {
            patchDiskStatus(mod.codename, 'update_available')
            setEntry(
              mod.codename,
              'updated',
              `${localVersion || '?'} → ${remote.version}`,
            )
            updated += 1
          } else {
            patchDiskStatus(mod.codename, 'present')
            setEntry(mod.codename, 'up_to_date', `Up to date (${remote.version})`)
            upToDate += 1
          }
        } catch (err) {
          if (cancelRef.current || isCancelledError(err)) {
            setEntry(mod.codename, 'skipped', 'Cancelled')
            break
          }
          failed += 1
          const message = err instanceof Error ? err.message : String(err)
          setEntry(mod.codename, 'failed', message)
        }
        setJob((prev) => ({
          ...prev,
          doneCount: prev.doneCount + 1,
          rateLimitHint: prev.rateLimitHint || rateLimitHint,
        }))
      }

      setPendingRemotes(nextPending)
      if (cancelRef.current) {
        await finishCancelled('check')
        return
      }
      const summary = `Check done: ${updated} update(s), ${available} available, ${upToDate} up to date, ${failed} failed`
      setJob((prev) => ({
        ...prev,
        running: false,
        activeCodename: null,
        progress: null,
        rateLimitHint: prev.rateLimitHint || rateLimitHint,
        summary,
      }))
      notifyFinished(
        failed > 0 && updated + available + upToDate === 0 ? 'error' : 'success',
        summary,
      )
    },
    [finishCancelled, notifyFinished, patchDiskStatus, setEntry],
  )

  const requestAcquire = useCallback((codenames: string[]) => {
    const targets = modsNeedingAcquire(modsRef.current, codenames)
    if (targets.length === 0) return

    const downloadDir = readAppDirPaths().modsDownloadDir.trim()
    if (!downloadDir) {
      onMissingDownloadDirRef.current?.()
      return
    }
    if (!isDesktopApp()) {
      const summary = 'Desktop app required'
      setJob({
        ...IDLE,
        open: true,
        kind: 'acquire',
        entries: [
          {
            codename: '—',
            status: 'failed',
            message: 'Downloading mods requires the desktop app.',
          },
        ],
        totalCount: 1,
        doneCount: 1,
        summary,
      })
      notifyFinished('error', summary)
      return
    }

    const estimate = estimateAcquireTotal({
      targets,
      pending: pendingRemotesRef.current,
    })
    const parts: string[] = []
    if (estimate.totalBytes != null) {
      const estNote =
        estimate.estimateCount > 0
          ? ` (includes ${estimate.estimateCount} catalog estimate${estimate.estimateCount === 1 ? '' : 's'})`
          : ''
      parts.push(`${formatBytes(estimate.totalBytes)}${estNote}`)
    } else {
      parts.push('size unknown')
    }
    if (estimate.unknownCount > 0) {
      parts.push(`${estimate.unknownCount} without size data`)
    }
    setSizeConfirm({
      targets,
      totalLabel: parts[0] ?? 'unknown',
      detail: parts.slice(1).join(' · '),
    })
  }, [notifyFinished])

  const confirmAcquire = useCallback(async () => {
    const confirm = sizeConfirm
    setSizeConfirm(null)
    if (!confirm) return
    const targets = confirm.targets
    const downloadDir = readAppDirPaths().modsDownloadDir.trim()
    if (!downloadDir) {
      onMissingDownloadDirRef.current?.()
      return
    }
    const token = readGithubToken()

    cancelRef.current = false
    setJob({
      kind: 'acquire',
      running: true,
      minimized: false,
      open: true,
      entries: targets.map((m) => ({
        codename: m.codename,
        status: 'pending',
        message: 'Queued',
      })),
      activeCodename: null,
      progress: null,
      doneCount: 0,
      totalCount: targets.length,
      summary: null,
      rateLimitHint: false,
    })

    let downloaded = 0
    let updated = 0
    let failed = 0
    const nextPending = new Map(pendingRemotesRef.current)

    for (const mod of targets) {
      if (cancelRef.current) break
      const wasUpdate = mod.diskStatus === 'update_available'
      patchDiskStatus(mod.codename, 'busy')
      setJob((prev) => ({
        ...prev,
        activeCodename: mod.codename,
        progress: null,
      }))
      setEntry(mod.codename, 'running', 'Starting…')

      try {
        let pending = nextPending.get(mod.codename)
        if (!pending) {
          setEntry(mod.codename, 'running', 'Probing remote…')
          const remote = await probeModRemote(
            {
              codename: mod.codename,
              url: mod.url,
              track: mod.track,
              download: mod.download,
              catalogSizeBytes: effectiveModFields(mod).sizeBytes,
            },
            token,
          )
          if (cancelRef.current) {
            patchDiskStatus(
              mod.codename,
              wasUpdate ? 'update_available' : 'not_present',
            )
            setEntry(mod.codename, 'skipped', 'Cancelled')
            break
          }
          pending = remoteToPending(remote)
          const catalogSize = effectiveModFields(mod).sizeBytes
          if (pending.sizeBytes == null && catalogSize != null) {
            pending = {
              ...pending,
              sizeBytes: catalogSize,
              sizeIsEstimate: true,
            }
          }
          nextPending.set(mod.codename, pending)
        }

        setEntry(mod.codename, 'running', 'Downloading…')
        const result = await acquireMod({
          codename: mod.codename,
          url: mod.url,
          track: mod.track,
          download: mod.download,
          downloadDir,
          remote: pendingToRemote(pending),
          githubToken: token || null,
        })

        if (cancelRef.current) {
          // Acquire finished just as cancel was requested — keep success.
        }

        const sizeBytes =
          result.sizeBytes ??
          pending.sizeBytes ??
          effectiveModFields(mod).sizeBytes

        applyAcquireSuccess(
          mod.codename,
          {
            version: pending.version,
            release: pending.release || effectiveModFields(mod).release,
            sizeBytes: sizeBytes ?? null,
          },
          { author: pending.owner },
        )
        nextPending.delete(mod.codename)
        clearSelectionRef.current?.(mod.codename)

        if (wasUpdate) {
          updated += 1
          setEntry(mod.codename, 'updated', pending.version)
        } else {
          downloaded += 1
          setEntry(mod.codename, 'ok', pending.version)
        }
      } catch (err) {
        if (cancelRef.current || isCancelledError(err)) {
          setEntry(mod.codename, 'skipped', 'Cancelled')
          patchDiskStatus(
            mod.codename,
            wasUpdate ? 'update_available' : 'not_present',
          )
          break
        }
        failed += 1
        const message = err instanceof Error ? err.message : String(err)
        setEntry(mod.codename, 'failed', message)
        patchDiskStatus(
          mod.codename,
          wasUpdate ? 'update_available' : 'not_present',
        )
      }

      setJob((prev) => ({ ...prev, doneCount: prev.doneCount + 1 }))
    }

    setPendingRemotes(nextPending)
    if (cancelRef.current) {
      await finishCancelled('acquire')
      return
    }
    await refreshDiskStatus()
    const summary = `Finished: ${downloaded} downloaded, ${updated} updated, ${failed} failed`
    setJob((prev) => ({
      ...prev,
      running: false,
      activeCodename: null,
      progress: null,
      summary,
    }))
    notifyFinished(
      failed > 0 && downloaded + updated === 0 ? 'error' : 'success',
      summary,
    )
  }, [
    applyAcquireSuccess,
    finishCancelled,
    notifyFinished,
    patchDiskStatus,
    refreshDiskStatus,
    setEntry,
    sizeConfirm,
  ])

  const cancelSizeConfirm = useCallback(() => setSizeConfirm(null), [])

  return {
    job,
    sizeConfirm,
    pendingRemotes,
    runCheck,
    requestAcquire,
    confirmAcquire,
    cancelSizeConfirm,
    cancelJob,
    minimizeJob,
    restoreJob,
    dismissJob,
  }
}
