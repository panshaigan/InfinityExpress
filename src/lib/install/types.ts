import type { SelectedGame } from '../xml/schema'

export type ComponentRunStatus =
  | 'queued'
  | 'copying'
  | 'installing'
  | 'succeeded'
  | 'succeededWithWarnings'
  | 'failed'
  | 'skipped'
  | 'alreadyInstalled'
  | 'needsInput'

export interface StepProgress {
  filesDone: number
  bytesDone: number
  indeterminate?: boolean
  label?: string
}

export type InstallRunState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'waitingForInput'
  | 'failed'
  | 'completed'

export type InstallPhase = 'eet1' | 'eet' | 'single'

export interface InstallStep {
  stepId: string
  phase: InstallPhase
  /**
   * XML download / lookup key (`<mod id>` or `<component modId>`).
   * Not the WeiDU mod id — that is `stagedFolderName` (tp2 parent folder).
   */
  modId: string
  /** Absolute path to tp2 after staging. */
  tp2Path: string
  /**
   * WeiDU mod id: folder name under the game dir that contains the tp2
   * (also the stem for `setup-{stagedFolderName}.exe`).
   */
  stagedFolderName: string
  componentId: string
  /** Display label for table. */
  componentLabel: string
  /** Resolved WeiDU component number; null until mod resolution runs. */
  weiduNumber: number | null
  languageIndex: number | null
  status: ComponentRunStatus
  progress?: StepProgress | null
  startedAt?: string
  finishedAt?: string
  warnings: string[]
  errors: string[]
  /** Deprecated: detail Results load from on-disk stream log; kept empty for session compat. */
  resultLines: string[]
  /** Step mod log (`{mod}-{component}-mod.log`, process stdout). */
  stdoutLogPath?: string
  /** Step component log (`{mod}-{component}-component.log`, process stderr). */
  stderrLogPath?: string
  debugLogPath?: string
}

export interface PlannedSnapshot {
  stepId: string
  name: string
}

export interface InstallRun {
  runId: string
  game: SelectedGame
  steps: InstallStep[]
  /**
   * Install cursor: index of the current package in `steps`.
   * Table highlight, Play resume, Pause/Stop/Skip all act relative to this.
   */
  cursor: number
  runState: InstallRunState
  /** Step ids that pause the run before staging (breakpoint mode B). */
  breakpointStepIds: string[]
  /** Named snapshots to take before staging the listed steps (one-shot). */
  plannedSnapshots: PlannedSnapshot[]
  /** Absolute path to run log directory under `{dataRoot}/projects/{folderName}/{runId}/`. */
  logDir: string
}

export interface WeiduComponentInfo {
  index: number
  number: number
  name: string
  label: string[]
}

export interface WeiduLanguageInfo {
  index: number
  name: string
}

export type LanguageSource = 'auto' | 'manual'

export interface ResolvedLanguage {
  index: number
  source: LanguageSource
}

export interface ModListingCacheEntry {
  tp2Path: string
  components: WeiduComponentInfo[]
  languages: WeiduLanguageInfo[]
  language: ResolvedLanguage | null
}

export type ModListingCache = Map<string, ModListingCacheEntry>

export type BackupKind = 'vanilla' | 'snapshot'

export interface BackupEntry {
  kind: BackupKind
  name: string
  path: string
  createdAt: string
  excludeSafeDirs: boolean
}

export interface BackupManifest {
  gameKey: string
  vanilla: BackupEntry | null
  snapshots: BackupEntry[]
}

export type WeiduInstallEvent =
  | { kind: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { kind: 'classified'; level: string; message: string }
  | { kind: 'inputRequired'; prompt: string }
  | { kind: 'stepStarted'; stepId: string }
  | { kind: 'stepFinished'; stepId: string; success: boolean; exitCode: number | null }
  | { kind: 'commandLogged'; command: string }
