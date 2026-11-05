import { isBrowserDemo } from '../runtime'
import { pinProjectCatalogs } from './projectStore'
import { readCatalogSnapshot } from '../persistence/catalogSnapshots'
import { parseInstallSequence } from '../xml/parseInstallSequence'
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
  pinProjectCatalogs()
  if (!isBrowserDemo) {
    suggestVanillaFromLegacyFolders()
    void syncManagedVanillasFromDisk()
  }

  const index = readProjectIndex()
  const hasProjects = Object.keys(index.projects).length > 0
  // No projects yet → new-project wizard. Otherwise hub so the user can pick.
  return {
    view: isBrowserDemo || hasProjects ? 'hub' : 'wizard',
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

/** Resolve the project's own XML before sanitizing selections or restoring its run. */
export async function loadProjectWithCatalog(projectId: ProjectId, bundledXml: string) {
  const record = getProject(projectId)
  if (!record) return null
  const xml = record.catalogRevision
    ? await readCatalogSnapshot(record.catalogRevision)
    : bundledXml
  const parsed = parseInstallSequence(xml)
  const loaded = loadProjectRecord(parsed.model, projectId)
  return loaded ? { ...loaded, ...parsed } : null
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
    if (!sanitized) throw new Error('The saved install plan is incompatible with this project catalog. Its original state has been kept.')
    if (sanitized?.run.logDir) {
      await writeInstallRunState(sanitized.run.logDir, sanitized)
    }
    return sanitized
  }

  const logDir = session.installRef?.logDir?.trim()
  if (!logDir) return undefined
  const fromDisk = await readInstallRunState(logDir)
  if (!fromDisk) throw new Error(`The saved install state is missing at ${logDir}. Restore the run folder before opening this project.`)
  const sanitized = sanitizeInstallSession(model, engine, selectedIds, fromDisk)
  if (!sanitized) throw new Error('The saved install plan is incompatible with this project catalog. Its original state has been kept.')
  return sanitized
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
