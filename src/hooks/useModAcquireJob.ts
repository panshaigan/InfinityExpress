import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acquireMod,
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

export function useModAcquireJob(args: {
  mods: WorkingMod[]
  patchDiskStatus: (
    codename: string,
    diskStatus: WorkingMod['diskStatus'],
  ) => void
  applyAcquireSuccess: (
    codename: string,
    overlays: { version: string; release: string; sizeBytes: number | null },
  ) => void
  refreshDiskStatus: () => Promise<void>
}) {
  const { mods, patchDiskStatus, applyAcquireSuccess, refreshDiskStatus } = args
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
    setJob((prev) => ({ ...prev, minimized: true, open: false }))
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

  const runCheck = useCallback(
    async (codenames: string[]) => {
      if (codenames.length === 0) return
      if (!isDesktopApp()) {
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
          summary: 'Desktop app required',
        })
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
              useMaster: mod.useMaster,
              useAssets: mod.useAssets,
              catalogSizeBytes: effectiveModFields(mod).sizeBytes,
            },
            token,
          )
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
              `Remote ${remote.version} (not on disk)`,
            )
            upToDate += 1
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
      setJob((prev) => ({
        ...prev,
        running: false,
        activeCodename: null,
        progress: null,
        rateLimitHint: prev.rateLimitHint || rateLimitHint,
        summary: `Check done: ${updated} update(s), ${upToDate} current, ${failed} failed`,
      }))
    },
    [patchDiskStatus, setEntry],
  )

  const requestAcquire = useCallback(
    (codenames: string[]) => {
      const targets = modsNeedingAcquire(modsRef.current, codenames)
      if (targets.length === 0) return

      const downloadDir = readAppDirPaths().modsDownloadDir.trim()
      if (!downloadDir) {
        setJob({
          ...IDLE,
          open: true,
          kind: 'acquire',
          entries: [
            {
              codename: '—',
              status: 'failed',
              message: 'Set a mods download directory in Settings first.',
            },
          ],
          totalCount: 1,
          doneCount: 1,
          summary: 'Missing download directory',
        })
        return
      }
      if (!isDesktopApp()) {
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
          summary: 'Desktop app required',
        })
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
    },
    [],
  )

  const confirmAcquire = useCallback(async () => {
    const confirm = sizeConfirm
    setSizeConfirm(null)
    if (!confirm) return
    const targets = confirm.targets
    const downloadDir = readAppDirPaths().modsDownloadDir.trim()
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
              useMaster: mod.useMaster,
              useAssets: mod.useAssets,
              catalogSizeBytes: effectiveModFields(mod).sizeBytes,
            },
            token,
          )
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
          useMaster: mod.useMaster,
          useAssets: mod.useAssets,
          downloadDir,
          remote: pendingToRemote(pending),
          githubToken: token || null,
        })

        const sizeBytes =
          result.sizeBytes ??
          pending.sizeBytes ??
          effectiveModFields(mod).sizeBytes

        applyAcquireSuccess(mod.codename, {
          version: pending.version,
          release: pending.release || effectiveModFields(mod).release,
          sizeBytes: sizeBytes ?? null,
        })
        nextPending.delete(mod.codename)

        if (wasUpdate) {
          updated += 1
          setEntry(mod.codename, 'updated', `Updated to ${pending.version}`)
        } else {
          downloaded += 1
          setEntry(mod.codename, 'ok', `Downloaded ${pending.version}`)
        }
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : String(err)
        setEntry(mod.codename, 'failed', message)
        // Restore prior status best-effort
        patchDiskStatus(
          mod.codename,
          wasUpdate ? 'update_available' : 'not_present',
        )
      }

      setJob((prev) => ({ ...prev, doneCount: prev.doneCount + 1 }))
    }

    setPendingRemotes(nextPending)
    await refreshDiskStatus()
    setJob((prev) => ({
      ...prev,
      running: false,
      activeCodename: null,
      progress: null,
      summary: `Finished: ${downloaded} downloaded, ${updated} updated, ${failed} failed`,
    }))
  }, [
    applyAcquireSuccess,
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
    minimizeJob,
    restoreJob,
    dismissJob,
  }
}
