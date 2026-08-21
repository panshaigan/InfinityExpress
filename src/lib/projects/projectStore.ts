import { GAME_LABELS, type SelectedGame } from '../xml/schema'
import type { GameFolderKey, GameFolderPaths } from '../ui/gameFolderPrefs'
import { gameFolderKeysForEngine } from '../ui/installPathValidation'
import type { GameSession } from '../ui/appSessionPrefs'
import {
  allocateUniqueFolderName,
  sanitizeProjectFolderName,
} from './projectPaths'
import type { ProjectId, ProjectIndex, ProjectMeta, ProjectRecord } from './types'
import { emptyDestinations, emptyProjectIndex } from './types'

export { emptyDestinations, emptyProjectIndex } from './types'
export type { ProjectId, ProjectIndex, ProjectMeta, ProjectRecord } from './types'

const STORAGE_KEY = 'infinity-express.projects-v1'

function isGameFolderPaths(value: unknown): value is GameFolderPaths {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.bg1 === 'string' &&
    typeof o.bg2 === 'string' &&
    typeof o.iwd === 'string' &&
    typeof o.pst === 'string'
  )
}

function isSelectedGame(value: unknown): value is SelectedGame {
  return (
    value === 'bg1' ||
    value === 'bg2' ||
    value === 'eet' ||
    value === 'iwd' ||
    value === 'pst'
  )
}

function coerceProjectMeta(value: unknown): ProjectMeta | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (
    typeof o.id !== 'string' ||
    typeof o.name !== 'string' ||
    !isSelectedGame(o.engine) ||
    typeof o.createdAt !== 'string' ||
    typeof o.lastOpenedAt !== 'string' ||
    !isGameFolderPaths(o.destinations)
  ) {
    return null
  }
  const folderName =
    typeof o.folderName === 'string' && o.folderName.trim()
      ? o.folderName.trim()
      : sanitizeProjectFolderName(o.name)
  return {
    id: o.id,
    name: o.name,
    folderName,
    engine: o.engine,
    createdAt: o.createdAt,
    lastOpenedAt: o.lastOpenedAt,
    destinations: o.destinations,
  }
}

function coerceProjectRecord(value: unknown): ProjectRecord | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  const meta = coerceProjectMeta(o.meta)
  if (!meta) return null
  if (o.session != null && typeof o.session !== 'object') return null
  return { meta, session: (o.session as GameSession | null) ?? null }
}

function coerceProjectIndex(value: unknown): ProjectIndex | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (o.version !== 1) return null
  if (o.lastProjectId != null && typeof o.lastProjectId !== 'string') return null
  if (!o.projects || typeof o.projects !== 'object') return null
  const projects: Record<ProjectId, ProjectRecord> = {}
  for (const [id, raw] of Object.entries(o.projects as Record<string, unknown>)) {
    const record = coerceProjectRecord(raw)
    if (!record) return null
    projects[id] = record
  }
  return {
    version: 1,
    lastProjectId: (o.lastProjectId as string | null) ?? null,
    projects,
  }
}

/** Folder names already claimed by other projects (optionally excluding one id). */
export function takenFolderNames(
  index: ProjectIndex = readProjectIndex(),
  exceptId?: ProjectId,
): string[] {
  return Object.values(index.projects)
    .filter((p) => p.meta.id !== exceptId)
    .map((p) => p.meta.folderName)
}

export function allocateProjectFolderName(
  displayName: string,
  exceptId?: ProjectId,
  index: ProjectIndex = readProjectIndex(),
): string {
  return allocateUniqueFolderName(displayName, takenFolderNames(index, exceptId))
}

export function readProjectIndex(): ProjectIndex {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyProjectIndex()
    const parsed: unknown = JSON.parse(raw)
    const coerced = coerceProjectIndex(parsed)
    if (!coerced) return emptyProjectIndex()
    return coerced
  } catch {
    return emptyProjectIndex()
  }
}

export function writeProjectIndex(index: ProjectIndex): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(index))
  } catch {
    /* private mode / blocked */
  }
}

export function listProjects(index: ProjectIndex = readProjectIndex()): ProjectMeta[] {
  return Object.values(index.projects)
    .map((p) => p.meta)
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
}

export function getProject(
  id: ProjectId,
  index: ProjectIndex = readProjectIndex(),
): ProjectRecord | null {
  return index.projects[id] ?? null
}

export function upsertProject(
  record: ProjectRecord,
  options?: { setLast?: boolean },
): ProjectIndex {
  const index = readProjectIndex()
  const next: ProjectIndex = {
    version: 1,
    lastProjectId: options?.setLast === false ? index.lastProjectId : record.meta.id,
    projects: { ...index.projects, [record.meta.id]: record },
  }
  writeProjectIndex(next)
  return next
}

export function updateProjectMeta(
  id: ProjectId,
  patch: Partial<
    Pick<ProjectMeta, 'name' | 'folderName' | 'destinations' | 'lastOpenedAt'>
  >,
): ProjectIndex {
  const index = readProjectIndex()
  const existing = index.projects[id]
  if (!existing) return index
  const meta: ProjectMeta = { ...existing.meta, ...patch }
  return upsertProject({ ...existing, meta }, { setLast: false })
}

export function saveProjectSession(
  id: ProjectId,
  session: GameSession,
): ProjectIndex {
  const index = readProjectIndex()
  const existing = index.projects[id]
  if (!existing) return index
  return upsertProject(
    {
      meta: { ...existing.meta, lastOpenedAt: new Date().toISOString() },
      session,
    },
    { setLast: true },
  )
}

export function deleteProject(id: ProjectId): ProjectIndex {
  const index = readProjectIndex()
  if (!index.projects[id]) return index
  const projects = { ...index.projects }
  delete projects[id]
  const next: ProjectIndex = {
    version: 1,
    lastProjectId: index.lastProjectId === id ? null : index.lastProjectId,
    projects,
  }
  writeProjectIndex(next)
  return next
}

export function setLastProjectId(id: ProjectId | null): ProjectIndex {
  const index = readProjectIndex()
  const next: ProjectIndex = { ...index, lastProjectId: id }
  writeProjectIndex(next)
  return next
}

export function newProjectId(): ProjectId {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function defaultProjectName(engine: SelectedGame, when = new Date()): string {
  const y = when.getFullYear()
  const m = String(when.getMonth() + 1).padStart(2, '0')
  const d = String(when.getDate()).padStart(2, '0')
  return `${GAME_LABELS[engine]} · ${y}-${m}-${d}`
}

export function destinationsForEngine(
  engine: SelectedGame,
  paths: Partial<Record<GameFolderKey, string>>,
): GameFolderPaths {
  const next = emptyDestinations()
  for (const key of gameFolderKeysForEngine(engine)) {
    next[key] = paths[key]?.trim() ?? ''
  }
  return next
}

/** Strip Engine from finished marks; map activeStation away from engine. */
export function adaptSessionForProjects(session: GameSession): GameSession {
  const finishedStations = session.finishedStations.filter((s) => s !== 'engine')
  const activeStation =
    session.activeStation === 'engine' ? 'presets' : session.activeStation
  return {
    ...session,
    finishedStations,
    activeStation,
    routeUnlocked: session.routeUnlocked || finishedStations.includes('presets'),
  }
}
