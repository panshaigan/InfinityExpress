import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isDesktopApp } from './fsDialogs'
import type { PendingRemoteMeta } from '../mods/acquireTargets'

export interface ProbeModInput {
  codename: string
  url: string
  useMaster: boolean
  useAssets: boolean
  catalogSizeBytes?: number | null
}

export interface RemoteProbeResult {
  version: string
  release: string
  downloadUrl: string | null
  extension: string | null
  strategy: string
  sizeBytes: number | null
  sizeIsEstimate: boolean
  usedScrapeFallback: boolean
  rateLimited: boolean
  zipballRef: string | null
  owner: string | null
  repo: string | null
}

export interface AcquireModInput {
  codename: string
  url: string
  useMaster: boolean
  useAssets: boolean
  downloadDir: string
  remote: RemoteProbeResult
  githubToken?: string | null
}

export interface AcquireModResult {
  sizeBytes: number | null
}

export interface ModAcquireProgress {
  codename: string
  phase: string
  message: string
  bytesReceived: number | null
  bytesTotal: number | null
}

export function remoteToPending(remote: RemoteProbeResult): PendingRemoteMeta {
  return {
    version: remote.version,
    release: remote.release,
    downloadUrl: remote.downloadUrl,
    extension: remote.extension,
    strategy: remote.strategy,
    sizeBytes: remote.sizeBytes,
    sizeIsEstimate: remote.sizeIsEstimate,
    usedScrapeFallback: remote.usedScrapeFallback,
    rateLimited: remote.rateLimited,
    zipballRef: remote.zipballRef,
    owner: remote.owner,
    repo: remote.repo,
  }
}

export async function probeModRemote(
  mod: ProbeModInput,
  githubToken?: string | null,
): Promise<RemoteProbeResult> {
  if (!isDesktopApp()) {
    throw new Error('Checking for updates requires the desktop app.')
  }
  return invoke<RemoteProbeResult>('probe_mod_remote', {
    modInput: mod,
    githubToken: githubToken?.trim() || null,
  })
}

export async function acquireMod(
  input: AcquireModInput,
): Promise<AcquireModResult> {
  if (!isDesktopApp()) {
    throw new Error('Downloading mods requires the desktop app.')
  }
  return invoke<AcquireModResult>('acquire_mod', { input })
}

export async function listenModAcquireProgress(
  handler: (payload: ModAcquireProgress) => void,
): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => {}
  return listen<ModAcquireProgress>('mod-acquire-progress', (event) => {
    handler(event.payload)
  })
}

/** Attach pending remote fields onto the invoke payload shape. */
export function pendingToRemote(pending: PendingRemoteMeta): RemoteProbeResult {
  return {
    version: pending.version,
    release: pending.release,
    downloadUrl: pending.downloadUrl,
    extension: pending.extension,
    strategy: pending.strategy,
    sizeBytes: pending.sizeBytes,
    sizeIsEstimate: pending.sizeIsEstimate,
    usedScrapeFallback: !!pending.usedScrapeFallback,
    rateLimited: !!pending.rateLimited,
    zipballRef: pending.zipballRef ?? null,
    owner: pending.owner ?? null,
    repo: pending.repo ?? null,
  }
}
