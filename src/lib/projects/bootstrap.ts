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
import type { InstallSequenceModel, SelectedGame } from '../xml/schema'
import { emptyDestinations } from '../projects/types'
import type { GameFolderPaths } from '../ui/gameFolderPrefs'
import {
  readInstallRunState,
  writeInstallRunState,
} from '../install/runStateStore'

export type AppShellView = 'hub' | 'wizard' | 'workspace'

export interface ProjectBootstrap {
  view: AppShellView
  projectId: ProjectId | null
  meta: ProjectMeta | null
  session: SanitizedGameSession | null
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
} | null {
  const record = getProject(projectId)
  if (!record) return null
  setLastProjectId(projectId)
  const raw = record.session
    ? adaptSessionForProjects(record.session)
    : null
  if (!raw) {
    return { record, session: null }
  }
  const session = sanitizeComponentsSession(
    model,
    record.meta.engine,
    raw,
    presetsForEngine(record.meta.engine),
  )
  return { record, session }
}

/**
 * Resolve the full install session for a project: prefer on-disk `run-state.json`,
 * fall back to a one-shot legacy localStorage blob (and migrate it to disk).
 */
export async function resolveProjectInstallSession(
  model: InstallSequenceModel,
  session: SanitizedGameSession | null,
  engine: SelectedGame,
): Promise<PersistedInstallSession | undefined> {
  if (!session) return undefined
  const selectedIds = new Set(session.selectedIds)

  if (session.legacyInstall) {
    const sanitized = sanitizeInstallSession(
      model,
      engine,
      selectedIds,
      session.legacyInstall,
    )
    if (sanitized?.run.logDir) {
      void writeInstallRunState(sanitized.run.logDir, sanitized)
    }
    return sanitized
  }

  const logDir = session.installRef?.logDir?.trim()
  if (!logDir) return undefined
  const fromDisk = await readInstallRunState(logDir)
  return sanitizeInstallSession(model, engine, selectedIds, fromDisk ?? undefined)
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
