import { isBrowserDemo } from '../runtime'
import { upsertProject } from './projectStore'
import { prepareCatalogSnapshot } from '../persistence/catalogSnapshots'
import { isDesktopApp, writeTextFileAt } from '../desktop/fsDialogs'
import { joinLogPath } from '../install/stepLogs'
import { refreshCatalogSession } from '../install/refreshCatalogSession'
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

/** Canonical XML defines every project's display; saved state is reconciled before committing it. */
export async function loadProjectWithCatalog(projectId: ProjectId, bundledXml: string) {
  const record = getProject(projectId)
  if (!record) return null
  const parsed = parseInstallSequence(bundledXml)
  const revision = await prepareCatalogSnapshot(bundledXml)
  const changed = record.catalogRevision !== revision
  const session = record.session ? sanitizeComponentsSession(
    parsed.model, record.meta.engine, adaptSessionForProjects(record.session), presetsForEngine(record.meta.engine),
  ) : null
  if (changed && session) session.modsJourney = null
  const install = await resolveProjectInstallSession(parsed.model, session, record.meta.engine, changed)
  if (session?.legacyInstall && install?.run.logDir && isDesktopApp()) {
    delete session.legacyInstall
    session.installRef = { runId: install.run.runId, logDir: install.run.logDir }
  }
  const next = { ...record, catalogRevision: revision, session }
  // Do not rewrite localStorage on an unchanged reopen, or before run-state migration succeeds.
  if (JSON.stringify(next) !== JSON.stringify(record)) upsertProject(next, { setLast: false })
  setLastProjectId(projectId)
  return { record: next, session, install, ...parsed }
}

/**
 * Resolve the full install session for a project: prefer on-disk `run-state.json`,
 * fall back to a one-shot legacy localStorage blob (and migrate it to disk).
 */
export async function resolveProjectInstallSession(
  model: InstallSequenceModel,
  session: SanitizedGameSession | null,
  engine: SelectedGame,
  refreshCatalog = false,
): Promise<PersistedInstallSession | undefined> {
  if (!session) return undefined
  const selectedIds = new Set(session.selectedIds)

  const logDir = session.installRef?.logDir?.trim()
  if (!session.legacyInstall && !logDir) return undefined
  const fromDisk = session.legacyInstall ?? await readInstallRunState(logDir!)
  if (!fromDisk) throw new Error(`The saved install state is missing at ${logDir}. Restore the run folder before opening this project.`)
  const sanitized = refreshCatalog
    ? refreshCatalogSession(model, engine, selectedIds, fromDisk)
    : sanitizeInstallSession(model, engine, selectedIds, fromDisk)
  if (!sanitized) throw new Error('The saved install plan is incompatible with this project catalog. Its original state has been kept.')
  if (refreshCatalog && isDesktopApp() && sanitized.run.logDir) {
    // Keep the exact previous history before updating the working plan. A failed archive aborts the refresh.
    await writeTextFileAt(joinLogPath(sanitized.run.logDir, `run-state.before-catalog-${crypto.randomUUID()}.json`),
      `${JSON.stringify({ ...fromDisk, schemaVersion: 1 }, null, 2)}\n`)
  }
  if ((refreshCatalog || session.legacyInstall) && sanitized.run.logDir) {
    await writeInstallRunState(sanitized.run.logDir, sanitized)
  }
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
