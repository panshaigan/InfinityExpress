import {
  adaptSessionForProjects,
  getProject,
  migrateLegacySessionsToProjects,
  readProjectIndex,
  setLastProjectId,
  suggestVanillaFromLegacyFolders,
  syncManagedVanillasFromDisk,
  type ProjectId,
  type ProjectMeta,
  type ProjectRecord,
} from '../projects'
import {
  sanitizeComponentsSession,
  sanitizeInstallSession,
  type GameSession,
  type PersistedInstallSession,
  type SanitizedGameSession,
} from '../ui/appSessionPrefs'
import type { AppPhase } from '../../ui/PhaseNav.types'
import type { InstallSequenceModel } from '../xml/schema'
import { emptyDestinations } from '../projects/types'
import type { GameFolderPaths } from '../ui/gameFolderPrefs'

export type AppShellView = 'hub' | 'wizard' | 'workspace'

export interface ProjectBootstrap {
  view: AppShellView
  projectId: ProjectId | null
  meta: ProjectMeta | null
  session: SanitizedGameSession | null
  install: PersistedInstallSession | undefined
  destinations: GameFolderPaths
  appPhase: AppPhase
}

export function bootstrapProjects(_model: InstallSequenceModel): ProjectBootstrap {
  migrateLegacySessionsToProjects()
  suggestVanillaFromLegacyFolders()
  void syncManagedVanillasFromDisk()

  const index = readProjectIndex()
  const lastId = index.lastProjectId
  // Always land on hub so the user can pick among projects; last id is restored when they open.
  if (!lastId || !index.projects[lastId]) {
    return {
      view: 'hub',
      projectId: null,
      meta: null,
      session: null,
      install: undefined,
      destinations: emptyDestinations(),
      appPhase: 'components',
    }
  }

  // Keep lastProjectId but still show hub (explicit pick). Caller may auto-open later.
  return {
    view: 'hub',
    projectId: null,
    meta: null,
    session: null,
    install: undefined,
    destinations: emptyDestinations(),
    appPhase: 'components',
  }
}

export function loadProjectRecord(
  model: InstallSequenceModel,
  projectId: ProjectId,
): {
  record: ProjectRecord
  session: SanitizedGameSession | null
  install: PersistedInstallSession | undefined
} | null {
  const record = getProject(projectId)
  if (!record) return null
  setLastProjectId(projectId)
  const raw = record.session
    ? adaptSessionForProjects(record.session)
    : null
  if (!raw) {
    return { record, session: null, install: undefined }
  }
  const session = sanitizeComponentsSession(model, record.meta.engine, raw)
  const install = sanitizeInstallSession(
    model,
    record.meta.engine,
    new Set(session.selectedIds),
    raw.install,
  )
  return { record, session, install }
}

export function emptyWorkspaceSession(): GameSession {
  return {
    selectedIds: [],
    finishedStations: ['presets'],
    routeUnlocked: true,
    selectionPresets: [],
    activePresetId: null,
    presetBaseline: null,
    activeStation: 'presets',
    contentMainKey: null,
    contentSubKey: null,
    contentSubTag: null,
    ladderChecked: [],
    lowerDifficultyPreset: false,
    higherDifficultyPreset: false,
    lastGlobalLadder: [],
    lastGlobalLowerDifficulty: false,
    lastGlobalHigherDifficulty: false,
    stationLevelPresets: {},
    modsJourney: null,
  }
}
