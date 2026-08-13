import type { LadderLevel } from '../levels'
import { LADDER_LEVELS } from '../levels'
import { buildInstallPlan } from '../install/planBuilder'
import type {
  ComponentRunStatus,
  InstallRun,
  InstallRunState,
  InstallStep,
  PlannedSnapshot,
} from '../install/types'
import type {
  SelectionPreset,
  StationLevelPresetData,
} from '../presets/selectionPresets'
import { finalizeSelection } from '../selection/selectionCore'
import type { InstallSequenceModel, SelectedGame } from '../xml/schema'
import { STATION_ORDER } from '../xml/schema'
import type { StationSlot } from './chromeHotkeys'
import type { AppPhase } from '../../ui/PhaseNav.types'
import type { AppNavSlot } from '../../ui/StationNav'
import type { ModsJourneyState } from '../../ui/mods/ModsStation'

export const APP_SESSION_STORAGE_KEY = 'infinity-express.app-session'

const SELECTED_GAMES: readonly SelectedGame[] = ['bg1', 'bg2', 'eet', 'iwd', 'pst']
const APP_PHASES: readonly AppPhase[] = ['components', 'mods', 'install']
const STATION_SLOTS: readonly StationSlot[] = [
  'engine',
  'presets',
  ...STATION_ORDER,
]
const RUN_STATES: readonly InstallRunState[] = [
  'idle',
  'running',
  'paused',
  'stopped',
  'waitingForInput',
  'failed',
  'completed',
]
const STEP_STATUSES: readonly ComponentRunStatus[] = [
  'queued',
  'copying',
  'installing',
  'succeeded',
  'succeededWithWarnings',
  'failed',
  'skipped',
  'alreadyInstalled',
  'needsInput',
]

export interface PersistedInstallSession {
  planFingerprint: string
  run: InstallRun
  ui: {
    selectedStepId: string | null
    selectedComponentId: string | null
    hideInstalled: boolean
    runElapsedMs: number
  }
  transport: {
    paused: boolean
    runState: InstallRunState
  }
}

export interface GameSession {
  selectedIds: string[]
  finishedStations: StationSlot[]
  routeUnlocked: boolean
  selectionPresets: SelectionPreset[]
  activePresetId: string | null
  presetBaseline: string | null
  activeStation: AppNavSlot
  contentMainKey: string | null
  contentSubKey: string | null
  contentSubTag: string | null
  ladderChecked: LadderLevel[]
  lowerDifficultyPreset: boolean
  higherDifficultyPreset: boolean
  lastGlobalLadder: LadderLevel[]
  lastGlobalLowerDifficulty: boolean
  lastGlobalHigherDifficulty: boolean
  stationLevelPresets: Record<string, StationLevelPresetData>
  modsJourney: ModsJourneyState | null
  install?: PersistedInstallSession
}

export interface AppSessionStore {
  version: 1
  lastGame: SelectedGame | null
  lastAppPhase: AppPhase
  byGame: Partial<Record<SelectedGame, GameSession>>
}

export interface SanitizedGameSession extends GameSession {
  selectedIds: string[]
}

function isSelectedGame(value: unknown): value is SelectedGame {
  return typeof value === 'string' && SELECTED_GAMES.includes(value as SelectedGame)
}

function isAppPhase(value: unknown): value is AppPhase {
  return typeof value === 'string' && APP_PHASES.includes(value as AppPhase)
}

function isStationSlot(value: unknown): value is StationSlot {
  return typeof value === 'string' && STATION_SLOTS.includes(value as StationSlot)
}

function isLadderLevel(value: unknown): value is LadderLevel {
  return typeof value === 'string' && LADDER_LEVELS.includes(value as LadderLevel)
}

function isRunState(value: unknown): value is InstallRunState {
  return typeof value === 'string' && RUN_STATES.includes(value as InstallRunState)
}

function isStepStatus(value: unknown): value is ComponentRunStatus {
  return typeof value === 'string' && STEP_STATUSES.includes(value as ComponentRunStatus)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function plannedSnapshotsFrom(value: unknown): PlannedSnapshot[] {
  if (!Array.isArray(value)) return []
  const out: PlannedSnapshot[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.stepId !== 'string' || typeof o.name !== 'string') continue
    const stepId = o.stepId.trim()
    const name = o.name.trim()
    if (!stepId || !name || seen.has(stepId)) continue
    seen.add(stepId)
    out.push({ stepId, name })
  }
  return out
}

function ladderArray(value: unknown): LadderLevel[] {
  return stringArray(value).filter(isLadderLevel)
}

function stationLevelPresetsFrom(value: unknown): Record<string, StationLevelPresetData> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, StationLevelPresetData> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    out[key] = {
      ladder: ladderArray(o.ladder),
      lowerDifficulty: o.lowerDifficulty === true,
      higherDifficulty: o.higherDifficulty === true,
    }
  }
  return out
}

function selectionPresetFrom(value: unknown): SelectionPreset | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !isSelectedGame(o.game)) {
    return null
  }
  return {
    id: o.id,
    name: o.name,
    game: o.game,
    selectedIds: stringArray(o.selectedIds),
    ladderChecked: ladderArray(o.ladderChecked),
    lowerDifficulty: o.lowerDifficulty === true,
    higherDifficulty: o.higherDifficulty === true,
    lastGlobalLadder: ladderArray(o.lastGlobalLadder),
    lastGlobalLowerDifficulty: o.lastGlobalLowerDifficulty === true,
    lastGlobalHigherDifficulty: o.lastGlobalHigherDifficulty === true,
    stationLevelPresets: stationLevelPresetsFrom(o.stationLevelPresets),
  }
}

function modsJourneyFrom(value: unknown): ModsJourneyState | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (o.locked !== true) return null
  return {
    locked: true,
    requiredCodenames: stringArray(o.requiredCodenames),
  }
}

function installStepFrom(value: unknown): InstallStep | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (
    typeof o.stepId !== 'string' ||
    typeof o.modId !== 'string' ||
    typeof o.componentId !== 'string' ||
    !isStepStatus(o.status)
  ) {
    return null
  }
  const phase = o.phase
  if (phase !== 'eet1' && phase !== 'eet' && phase !== 'single') return null
  const componentLabel =
    typeof o.componentLabel === 'string' ? o.componentLabel : o.componentId
  const progress =
    o.progress && typeof o.progress === 'object'
      ? {
          filesDone: Number((o.progress as Record<string, unknown>).filesDone) || 0,
          bytesDone: Number((o.progress as Record<string, unknown>).bytesDone) || 0,
          indeterminate:
            (o.progress as Record<string, unknown>).indeterminate === true ? true : undefined,
          label:
            typeof (o.progress as Record<string, unknown>).label === 'string'
              ? ((o.progress as Record<string, unknown>).label as string)
              : undefined,
        }
      : null
  return {
    stepId: o.stepId,
    phase,
    modId: o.modId,
    tp2Path: typeof o.tp2Path === 'string' ? o.tp2Path : '',
    stagedFolderName: typeof o.stagedFolderName === 'string' ? o.stagedFolderName : '',
    componentId: o.componentId,
    componentLabel,
    weiduNumber:
      typeof o.weiduNumber === 'number' && Number.isFinite(o.weiduNumber)
        ? o.weiduNumber
        : null,
    languageIndex:
      typeof o.languageIndex === 'number' && Number.isFinite(o.languageIndex)
        ? o.languageIndex
        : null,
    status: o.status,
    progress,
    startedAt: typeof o.startedAt === 'string' ? o.startedAt : undefined,
    finishedAt: typeof o.finishedAt === 'string' ? o.finishedAt : undefined,
    warnings: stringArray(o.warnings),
    errors: stringArray(o.errors),
    resultLines: stringArray(o.resultLines),
    stdoutLogPath: typeof o.stdoutLogPath === 'string' ? o.stdoutLogPath : undefined,
    stderrLogPath: typeof o.stderrLogPath === 'string' ? o.stderrLogPath : undefined,
    debugLogPath: typeof o.debugLogPath === 'string' ? o.debugLogPath : undefined,
  }
}

function installRunFrom(value: unknown): InstallRun | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (
    typeof o.runId !== 'string' ||
    !isSelectedGame(o.game) ||
    typeof o.logDir !== 'string' ||
    !Array.isArray(o.steps)
  ) {
    return null
  }
  const steps = o.steps
    .map(installStepFrom)
    .filter((s): s is InstallStep => s != null)
  if (steps.length !== o.steps.length) return null
  const cursor = typeof o.cursor === 'number' && o.cursor >= 0 ? o.cursor : 0
  const runState = isRunState(o.runState) ? o.runState : 'idle'
  return {
    runId: o.runId,
    game: o.game,
    steps,
    cursor: Math.min(cursor, Math.max(0, steps.length - 1)),
    runState,
    breakpointStepIds: stringArray(o.breakpointStepIds),
    plannedSnapshots: plannedSnapshotsFrom(o.plannedSnapshots),
    logDir: o.logDir,
  }
}

function persistedInstallFrom(value: unknown): PersistedInstallSession | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  const run = installRunFrom(o.run)
  if (!run || typeof o.planFingerprint !== 'string') return null
  const uiRaw = o.ui
  const transportRaw = o.transport
  const uiObj =
    uiRaw && typeof uiRaw === 'object' ? (uiRaw as Record<string, unknown>) : {}
  const transportObj =
    transportRaw && typeof transportRaw === 'object'
      ? (transportRaw as Record<string, unknown>)
      : {}
  return {
    planFingerprint: o.planFingerprint,
    run,
    ui: {
      selectedStepId:
        typeof uiObj.selectedStepId === 'string' ? uiObj.selectedStepId : null,
      selectedComponentId:
        typeof uiObj.selectedComponentId === 'string'
          ? uiObj.selectedComponentId
          : null,
      hideInstalled: uiObj.hideInstalled === true,
      runElapsedMs:
        typeof uiObj.runElapsedMs === 'number' && uiObj.runElapsedMs >= 0
          ? uiObj.runElapsedMs
          : 0,
    },
    transport: {
      paused: transportObj.paused === true,
      runState: isRunState(transportObj.runState) ? transportObj.runState : run.runState,
    },
  }
}

function gameSessionFrom(value: unknown): GameSession | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  const finishedStations = stringArray(o.finishedStations).filter(isStationSlot)
  const selectionPresets = Array.isArray(o.selectionPresets)
    ? o.selectionPresets
        .map(selectionPresetFrom)
        .filter((p): p is SelectionPreset => p != null)
    : []
  let activePresetId =
    typeof o.activePresetId === 'string' ? o.activePresetId : null
  if (activePresetId && !selectionPresets.some((p) => p.id === activePresetId)) {
    activePresetId = null
  }
  const activeStation = isStationSlot(o.activeStation) ? o.activeStation : 'presets'
  const install = o.install != null ? persistedInstallFrom(o.install) : undefined
  return {
    selectedIds: stringArray(o.selectedIds),
    finishedStations,
    routeUnlocked: o.routeUnlocked === true,
    selectionPresets,
    activePresetId,
    presetBaseline: typeof o.presetBaseline === 'string' ? o.presetBaseline : null,
    activeStation,
    contentMainKey: typeof o.contentMainKey === 'string' ? o.contentMainKey : null,
    contentSubKey: typeof o.contentSubKey === 'string' ? o.contentSubKey : null,
    contentSubTag: typeof o.contentSubTag === 'string' ? o.contentSubTag : null,
    ladderChecked: ladderArray(o.ladderChecked),
    lowerDifficultyPreset: o.lowerDifficultyPreset === true,
    higherDifficultyPreset: o.higherDifficultyPreset === true,
    lastGlobalLadder: ladderArray(o.lastGlobalLadder),
    lastGlobalLowerDifficulty: o.lastGlobalLowerDifficulty === true,
    lastGlobalHigherDifficulty: o.lastGlobalHigherDifficulty === true,
    stationLevelPresets: stationLevelPresetsFrom(o.stationLevelPresets),
    modsJourney: modsJourneyFrom(o.modsJourney),
    ...(install ? { install } : {}),
  }
}

function appSessionStoreFrom(value: unknown): AppSessionStore | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (o.version !== 1) return null
  const lastGame = o.lastGame == null ? null : isSelectedGame(o.lastGame) ? o.lastGame : null
  const lastAppPhase = isAppPhase(o.lastAppPhase) ? o.lastAppPhase : 'components'
  const byGame: Partial<Record<SelectedGame, GameSession>> = {}
  if (o.byGame && typeof o.byGame === 'object') {
    for (const game of SELECTED_GAMES) {
      const raw = (o.byGame as Record<string, unknown>)[game]
      const session = gameSessionFrom(raw)
      if (session) byGame[game] = session
    }
  }
  return { version: 1, lastGame, lastAppPhase, byGame }
}

export function readAppSession(): AppSessionStore {
  try {
    const raw = window.localStorage.getItem(APP_SESSION_STORAGE_KEY)
    if (!raw) return emptyAppSession()
    const parsed: unknown = JSON.parse(raw)
    return appSessionStoreFrom(parsed) ?? emptyAppSession()
  } catch {
    return emptyAppSession()
  }
}

export function writeAppSession(store: AppSessionStore): void {
  try {
    window.localStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* private mode / blocked storage / quota */
  }
}

export function emptyAppSession(): AppSessionStore {
  return { version: 1, lastGame: null, lastAppPhase: 'components', byGame: {} }
}

export function readGameSession(
  store: AppSessionStore,
  game: SelectedGame,
): GameSession | null {
  return store.byGame[game] ?? null
}

export function buildPlanFingerprint(
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
): string {
  return JSON.stringify({ game, selectedIds: [...selectedIds].sort() })
}

export function planStepsMatchRun(
  run: InstallRun,
  planSteps: ReturnType<typeof buildInstallPlan>,
): boolean {
  if (run.steps.length !== planSteps.length) return false
  for (let i = 0; i < planSteps.length; i++) {
    const a = run.steps[i]
    const b = planSteps[i]
    if (a.stepId !== b.stepId || a.modId !== b.modId) return false
    if (a.componentId !== b.componentId) return false
  }
  return true
}

const IN_FLIGHT_STATUSES = new Set<ComponentRunStatus>(['copying', 'installing'])

function normalizeStepForPersist(step: InstallStep, savedAt: string): InstallStep {
  if (IN_FLIGHT_STATUSES.has(step.status)) {
    return {
      ...step,
      status: 'queued',
      progress: null,
      startedAt: undefined,
      finishedAt: undefined,
    }
  }
  if (step.startedAt && !step.finishedAt) {
    return { ...step, progress: null, finishedAt: savedAt }
  }
  return { ...step, progress: null }
}

function normalizeRunStateForPersist(runState: InstallRunState): InstallRunState {
  if (runState === 'running' || runState === 'waitingForInput') return 'paused'
  return runState
}

export function normalizeInstallRunForPersist(run: InstallRun): InstallRun {
  const savedAt = new Date().toISOString()
  return {
    ...run,
    runState: normalizeRunStateForPersist(run.runState),
    steps: run.steps.map((step) => normalizeStepForPersist(step, savedAt)),
  }
}

export function normalizeInstallRunForRestore(run: InstallRun): InstallRun {
  return normalizeInstallRunForPersist(run)
}

export function sanitizeComponentsSession(
  model: InstallSequenceModel,
  game: SelectedGame,
  session: GameSession,
): SanitizedGameSession {
  const knownIds = new Set(model.componentsInOrder.map((c) => c.componentId))
  const filtered = session.selectedIds.filter((id) => knownIds.has(id))
  const finalized = new Set(filtered)
  finalizeSelection(model, finalized, game)
  let activePresetId = session.activePresetId
  let presetBaseline = session.presetBaseline
  if (
    activePresetId &&
    !session.selectionPresets.some((p) => p.id === activePresetId)
  ) {
    activePresetId = null
    presetBaseline = null
  }
  return {
    ...session,
    selectedIds: [...finalized],
    activePresetId,
    presetBaseline,
  }
}

export function sanitizeInstallSession(
  model: InstallSequenceModel,
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
  install: PersistedInstallSession | undefined,
): PersistedInstallSession | undefined {
  if (!install) return undefined
  const fingerprint = buildPlanFingerprint(game, selectedIds)
  if (install.planFingerprint !== fingerprint) return undefined
  if (install.run.game !== game) return undefined
  const planSteps = buildInstallPlan(model, selectedIds, game)
  if (!planStepsMatchRun(install.run, planSteps)) return undefined
  const run = normalizeInstallRunForRestore(install.run)
  return {
    ...install,
    run,
    transport: {
      paused:
        install.transport.paused ||
        install.transport.runState === 'paused' ||
        install.transport.runState === 'running' ||
        install.transport.runState === 'waitingForInput',
      runState: normalizeRunStateForPersist(install.transport.runState),
    },
  }
}

export function buildGameSessionSnapshot(input: {
  selectedIds: ReadonlySet<string>
  finishedStations: ReadonlySet<StationSlot>
  routeUnlocked: boolean
  selectionPresets: readonly SelectionPreset[]
  activePresetId: string | null
  presetBaseline: string | null
  activeStation: AppNavSlot
  contentMainKey: string | null
  contentSubKey: string | null
  contentSubTag: string | null
  ladderChecked: ReadonlySet<LadderLevel>
  lowerDifficultyPreset: boolean
  higherDifficultyPreset: boolean
  lastGlobalLadder: ReadonlySet<LadderLevel>
  lastGlobalLowerDifficulty: boolean
  lastGlobalHigherDifficulty: boolean
  stationLevelPresets: ReadonlyMap<
    string,
    {
      ladder: Iterable<LadderLevel>
      lowerDifficulty: boolean
      higherDifficulty: boolean
    }
  >
  modsJourney: ModsJourneyState | null
  install?: PersistedInstallSession
}): GameSession {
  const stationLevelPresets: Record<string, StationLevelPresetData> = {}
  for (const [key, value] of input.stationLevelPresets) {
    stationLevelPresets[key] = {
      ladder: [...value.ladder],
      lowerDifficulty: value.lowerDifficulty,
      higherDifficulty: value.higherDifficulty,
    }
  }
  return {
    selectedIds: [...input.selectedIds].sort(),
    finishedStations: [...input.finishedStations],
    routeUnlocked: input.routeUnlocked,
    selectionPresets: input.selectionPresets.map((p) => ({ ...p })),
    activePresetId: input.activePresetId,
    presetBaseline: input.presetBaseline,
    activeStation: input.activeStation,
    contentMainKey: input.contentMainKey,
    contentSubKey: input.contentSubKey,
    contentSubTag: input.contentSubTag,
    ladderChecked: [...input.ladderChecked],
    lowerDifficultyPreset: input.lowerDifficultyPreset,
    higherDifficultyPreset: input.higherDifficultyPreset,
    lastGlobalLadder: [...input.lastGlobalLadder],
    lastGlobalLowerDifficulty: input.lastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty: input.lastGlobalHigherDifficulty,
    stationLevelPresets,
    modsJourney: input.modsJourney ? { ...input.modsJourney } : null,
    ...(input.install ? { install: input.install } : {}),
  }
}

export function buildPersistedInstallSession(input: {
  game: SelectedGame
  selectedIds: ReadonlySet<string>
  run: InstallRun
  paused: boolean
  selectedStepId: string | null
  selectedComponentId: string | null
  hideInstalled: boolean
  runElapsedMs: number
}): PersistedInstallSession {
  const run = normalizeInstallRunForPersist(input.run)
  return {
    planFingerprint: buildPlanFingerprint(input.game, input.selectedIds),
    run,
    ui: {
      selectedStepId: input.selectedStepId,
      selectedComponentId: input.selectedComponentId,
      hideInstalled: input.hideInstalled,
      runElapsedMs: input.runElapsedMs,
    },
    transport: {
      paused: input.paused || run.runState === 'paused',
      runState: run.runState,
    },
  }
}

export function mergeAppSession(
  store: AppSessionStore,
  game: SelectedGame,
  session: GameSession,
  lastAppPhase: AppPhase,
): AppSessionStore {
  return {
    version: 1,
    lastGame: game,
    lastAppPhase,
    byGame: { ...store.byGame, [game]: session },
  }
}

export interface SessionBootstrap {
  store: AppSessionStore
  game: SelectedGame | null
  session: SanitizedGameSession | null
  install: PersistedInstallSession | undefined
  appPhase: AppPhase
}

export function bootstrapAppSession(
  model: InstallSequenceModel,
): SessionBootstrap {
  const store = readAppSession()
  const game = store.lastGame
  if (!game) {
    return {
      store,
      game: null,
      session: null,
      install: undefined,
      appPhase: 'components',
    }
  }
  const raw = store.byGame[game]
  if (!raw) {
    return {
      store,
      game,
      session: null,
      install: undefined,
      appPhase: store.lastAppPhase,
    }
  }
  const session = sanitizeComponentsSession(model, game, raw)
  const install = sanitizeInstallSession(
    model,
    game,
    new Set(session.selectedIds),
    raw.install,
  )
  return {
    store,
    game,
    session,
    install,
    appPhase: store.lastAppPhase,
  }
}

export function levelPresetsInitialFromSession(
  session: GameSession,
): {
  ladderChecked: readonly LadderLevel[]
  lowerDifficultyPreset: boolean
  higherDifficultyPreset: boolean
  lastGlobalLadder: readonly LadderLevel[]
  lastGlobalLowerDifficulty: boolean
  lastGlobalHigherDifficulty: boolean
  stationLevelPresets: Map<
    string,
    {
      ladder: ReadonlySet<LadderLevel>
      lowerDifficulty: boolean
      higherDifficulty: boolean
    }
  >
} {
  const stationLevelPresets = new Map<
    string,
    {
      ladder: ReadonlySet<LadderLevel>
      lowerDifficulty: boolean
      higherDifficulty: boolean
    }
  >()
  for (const [key, value] of Object.entries(session.stationLevelPresets)) {
    stationLevelPresets.set(key, {
      ladder: new Set(value.ladder),
      lowerDifficulty: value.lowerDifficulty,
      higherDifficulty: value.higherDifficulty,
    })
  }
  return {
    ladderChecked: session.ladderChecked,
    lowerDifficultyPreset: session.lowerDifficultyPreset,
    higherDifficultyPreset: session.higherDifficultyPreset,
    lastGlobalLadder: session.lastGlobalLadder,
    lastGlobalLowerDifficulty: session.lastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty: session.lastGlobalHigherDifficulty,
    stationLevelPresets,
  }
}
