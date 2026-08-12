import {
  emptyAppSession,
  readAppSession,
  type AppSessionStore,
} from '../ui/appSessionPrefs'
import {
  readGameFolderPaths,
  type GameFolderPaths,
} from '../ui/gameFolderPrefs'
import type { SelectedGame } from '../xml/schema'
import {
  adaptSessionForProjects,
  defaultProjectName,
  newProjectId,
  readProjectIndex,
  upsertProject,
  writeProjectIndex,
} from './projectStore'
import { emptyDestinations, type ProjectIndex } from './types'
import { readVanillaRegistry, setVanillaBinding } from './vanillaRegistry'

const MIGRATION_FLAG = 'infinity-express.projects-migrated-v1'

function destinationsFromLegacy(
  engine: SelectedGame,
  folders: GameFolderPaths,
): GameFolderPaths {
  const next = emptyDestinations()
  if (engine === 'eet') {
    next.bg1 = folders.bg1
    next.bg2 = folders.bg2
  } else if (engine === 'bg1' || engine === 'bg2' || engine === 'iwd' || engine === 'pst') {
    next[engine] = folders[engine]
  }
  return next
}

/**
 * One-shot: convert legacy per-game localStorage sessions into projects.
 * Does not invent vanilla bindings (user may still need Settings / wizard).
 */
export function migrateLegacySessionsToProjects(
  now = new Date(),
): ProjectIndex {
  if (typeof window === 'undefined') return readProjectIndex()
  try {
    if (window.localStorage.getItem(MIGRATION_FLAG) === '1') {
      return readProjectIndex()
    }
  } catch {
    /* ignore */
  }

  const existing = readProjectIndex()
  if (Object.keys(existing.projects).length > 0) {
    try {
      window.localStorage.setItem(MIGRATION_FLAG, '1')
    } catch {
      /* ignore */
    }
    return existing
  }

  const legacy: AppSessionStore = readAppSession()
  const folders = readGameFolderPaths()
  let index = existing
  const games = Object.keys(legacy.byGame) as SelectedGame[]

  for (const engine of games) {
    const raw = legacy.byGame[engine]
    if (!raw) continue
    const id = newProjectId()
    const iso = now.toISOString()
    const session = adaptSessionForProjects(raw)
    index = upsertProject(
      {
        meta: {
          id,
          name: `${defaultProjectName(engine, now)} (migrated)`,
          engine,
          createdAt: iso,
          lastOpenedAt: iso,
          destinations: destinationsFromLegacy(engine, folders),
        },
        session,
      },
      { setLast: engine === legacy.lastGame },
    )
  }

  if (legacy.lastGame && index.lastProjectId == null) {
    const match = Object.values(index.projects).find(
      (p) => p.meta.engine === legacy.lastGame,
    )
    if (match) {
      index = { ...index, lastProjectId: match.meta.id }
      writeProjectIndex(index)
    }
  }

  try {
    window.localStorage.setItem(
      'infinity-express.app-session',
      JSON.stringify(emptyAppSession()),
    )
    window.localStorage.setItem(MIGRATION_FLAG, '1')
  } catch {
    /* ignore */
  }

  return index
}

/** Register external vanilla from legacy game-folder paths when still empty. */
export function suggestVanillaFromLegacyFolders(): void {
  const registry = readVanillaRegistry()
  const folders = readGameFolderPaths()
  for (const key of ['bg1', 'bg2', 'iwd', 'pst'] as const) {
    if (registry[key]?.path?.trim()) continue
    const path = folders[key]?.trim()
    if (!path) continue
    setVanillaBinding(key, { mode: 'external', path })
  }
}
