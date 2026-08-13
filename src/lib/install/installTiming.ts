import type { SelectedGame } from '../xml/schema'
import type { ComponentRunStatus, InstallPhase } from './types'

export const INSTALL_TIMING_SCHEMA_VERSION = 1 as const

export type InstallTimingStatus = 'succeeded' | 'succeededWithWarnings'

export interface ComponentInstallTimingRecord {
  v: typeof INSTALL_TIMING_SCHEMA_VERSION
  loggedAt: string
  projectId: string
  runId: string
  game: SelectedGame
  phase: InstallPhase
  componentId: string
  modId: string
  weiduModId: string
  weiduNumber: number
  status: InstallTimingStatus
  logVerified: boolean
  didStage: boolean
  startedAt: string
  installStartedAt: string
  finishedAt: string
  prepareMs: number
  installMs: number
  wallMs: number
}

export interface BuildInstallTimingInput {
  projectId: string
  runId: string
  game: SelectedGame
  phase: InstallPhase
  componentId: string
  modId: string
  weiduModId: string
  weiduNumber: number | null
  status: ComponentRunStatus
  logVerified: boolean
  didStage: boolean
  startedAt?: string
  installStartedAt: string
  finishedAt?: string
  installMs: number
  loggedAt?: string
}

function normalizeDataRoot(dataRoot: string): string {
  return dataRoot.replace(/\\/g, '/').replace(/\/$/, '')
}

/** App-global JSONL log under the main data folder. */
export function componentInstallTimesPath(dataRoot: string): string {
  return `${normalizeDataRoot(dataRoot)}/metrics/component-install-times.jsonl`
}

export function isInstallTimingEligible(
  status: ComponentRunStatus,
): status is InstallTimingStatus {
  return status === 'succeeded' || status === 'succeededWithWarnings'
}

function elapsedMs(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.max(0, Math.round(to - from))
}

function finiteMs(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.round(value))
}

/** One JSON object plus a trailing newline. Returns null when the step should not be logged. */
export function buildComponentInstallTimingRecord(
  input: BuildInstallTimingInput,
): ComponentInstallTimingRecord | null {
  if (!isInstallTimingEligible(input.status)) return null
  const projectId = input.projectId.trim()
  const runId = input.runId.trim()
  if (!projectId || !runId) return null
  if (input.weiduNumber == null || !Number.isFinite(input.weiduNumber)) return null
  const startedAt = input.startedAt?.trim() ?? ''
  const installStartedAt = input.installStartedAt.trim()
  const finishedAt = input.finishedAt?.trim() ?? ''
  if (!startedAt || !installStartedAt || !finishedAt) return null
  const prepareMs = elapsedMs(startedAt, installStartedAt)
  const wallMs = elapsedMs(startedAt, finishedAt)
  const installMs = finiteMs(input.installMs)
  if (prepareMs == null || wallMs == null || installMs == null) return null
  return {
    v: INSTALL_TIMING_SCHEMA_VERSION,
    loggedAt: input.loggedAt?.trim() || new Date().toISOString(),
    projectId,
    runId,
    game: input.game,
    phase: input.phase,
    componentId: input.componentId,
    modId: input.modId,
    weiduModId: input.weiduModId,
    weiduNumber: input.weiduNumber,
    status: input.status,
    logVerified: input.logVerified,
    didStage: input.didStage,
    startedAt,
    installStartedAt,
    finishedAt,
    prepareMs,
    installMs,
    wallMs,
  }
}

export function serializeInstallTimingLine(
  record: ComponentInstallTimingRecord,
): string {
  return `${JSON.stringify(record)}\n`
}
