import type { GameFolderKey, GameFolderPaths } from '../ui/gameFolderPrefs'
import type { GameSession } from '../ui/appSessionPrefs'
import type { SelectedGame } from '../xml/schema'

export type ProjectId = string

/** App-wide vanilla binding for one engine folder key. */
export type VanillaBinding =
  | {
      mode: 'external'
      path: string
      version?: string
    }
  | {
      mode: 'managed'
      /** Absolute path to `{dataRoot}/backups/{key}`. */
      path: string
      version?: string
    }

export type VanillaRegistry = Partial<Record<GameFolderKey, VanillaBinding>>

export interface ProjectMeta {
  id: ProjectId
  name: string
  engine: SelectedGame
  createdAt: string
  lastOpenedAt: string
  /** Live / modded install destinations (not vanilla). */
  destinations: GameFolderPaths
}

export interface ProjectRecord {
  meta: ProjectMeta
  session: GameSession | null
}

export interface ProjectIndex {
  version: 1
  lastProjectId: ProjectId | null
  projects: Record<ProjectId, ProjectRecord>
}

export type PrepareDestinationAction =
  | 'created_empty'
  | 'copied_vanilla'
  | 'accepted_existing'

export interface PrepareDestinationResult {
  action: PrepareDestinationAction
  path: string
}

export function emptyDestinations(): GameFolderPaths {
  return { bg1: '', bg2: '', iwd: '', pst: '' }
}

export function emptyProjectIndex(): ProjectIndex {
  return { version: 1, lastProjectId: null, projects: {} }
}
