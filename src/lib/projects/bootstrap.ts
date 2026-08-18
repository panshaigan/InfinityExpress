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
import { migrateSelectionPresetsToEngineStore, presetsForEngine } from '../presets/selectionPresetsStore'
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
  migrateSelectionPresetsToEngineStore()
  suggestVanillaFromLegacyFolders()
  void syncManagedVanillasFromDisk()

  const index = readProjectIndex()
  const hasProjects = Object.keys(index.projects).length > 0
  // No projects yet → new-project wizard. Otherwise hub so the user can pick.
  return {
    view: hasProjects ? 'hub' : 'wizard',
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
  const session = sanitizeComponentsSession(
    model,
    record.meta.engine,
    raw,
    presetsForEngine(record.meta.engine),
  )
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
    finishedStations: [],
    routeUnlocked: true,
    activePresetId: null,
    presetBaseline: null,
    activeStation: 'presets',
    contentMainKey: null,
    contentSubKey: null,
    contentSubTag: null,
    recommendedChecked: [],
    packagesChecked: [],
    modsJourney: null,
  }
}
