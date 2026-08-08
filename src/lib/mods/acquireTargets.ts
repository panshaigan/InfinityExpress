import type { DiskStatus, WorkingMod } from './loadMods'

/** Remote tip cached after Check for updates (session only). */
export interface PendingRemoteMeta {
  version: string
  release: string
  downloadUrl: string | null
  extension: string | null
  /** Resolved download / zipball ref used by acquire. */
  strategy: string
  sizeBytes: number | null
  /** True when size came from catalog estimate, not remote. */
  sizeIsEstimate: boolean
  /** Hint that GitHub rate-limited and scrape/API fallback was used. */
  usedScrapeFallback?: boolean
  rateLimited?: boolean
  zipballRef?: string | null
  owner?: string | null
  repo?: string | null
}

export type AcquireButtonKind = 'download' | 'update' | 'download_and_update' | 'none'

/** Mods the acquire button should act on (no re-probe). */
export function modsNeedingAcquire(
  mods: readonly WorkingMod[],
  codenames: readonly string[],
): WorkingMod[] {
  const want = new Set(codenames)
  return mods.filter(
    (m) =>
      want.has(m.codename) &&
      (m.diskStatus === 'not_present' || m.diskStatus === 'update_available'),
  )
}

export function acquireButtonKind(
  statuses: readonly DiskStatus[],
): AcquireButtonKind {
  let needDownload = false
  let needUpdate = false
  for (const s of statuses) {
    if (s === 'not_present') needDownload = true
    if (s === 'update_available') needUpdate = true
  }
  if (needDownload && needUpdate) return 'download_and_update'
  if (needDownload) return 'download'
  if (needUpdate) return 'update'
  return 'none'
}

export function acquireButtonLabel(kind: AcquireButtonKind): string {
  switch (kind) {
    case 'download':
      return 'Download'
    case 'update':
      return 'Update'
    case 'download_and_update':
      return 'Download & Update'
    case 'none':
      return 'Download / Update'
  }
}

/** Sum sizes for confirm dialog; catalog size used when remote unknown. */
export function estimateAcquireTotal(args: {
  targets: readonly WorkingMod[]
  pending: ReadonlyMap<string, PendingRemoteMeta>
}): {
  totalBytes: number | null
  knownCount: number
  estimateCount: number
  unknownCount: number
} {
  let total = 0
  let knownCount = 0
  let estimateCount = 0
  let unknownCount = 0
  let any = false

  for (const mod of args.targets) {
    const tip = args.pending.get(mod.codename)
    if (tip?.sizeBytes != null && tip.sizeBytes >= 0) {
      total += tip.sizeBytes
      any = true
      if (tip.sizeIsEstimate) estimateCount += 1
      else knownCount += 1
      continue
    }
    const catalog =
      mod.overlays.sizeBytes !== undefined
        ? mod.overlays.sizeBytes
        : mod.sizeBytes
    if (catalog != null && catalog >= 0) {
      total += catalog
      any = true
      estimateCount += 1
    } else {
      unknownCount += 1
    }
  }

  return {
    totalBytes: any ? total : null,
    knownCount,
    estimateCount,
    unknownCount,
  }
}
