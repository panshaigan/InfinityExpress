import {
  adaptSessionForProjects,
  newProjectId,
  upsertProject,
  type ProjectId,
} from '../../lib/projects'
import type { GameFolderPaths } from '../../lib/ui/gameFolderPrefs'
import type { SelectedGame } from '../../lib/xml/schema'
import type { GameSession } from '../../lib/ui/appSessionPrefs'

export function createProjectFromWizard(input: {
  name: string
  engine: SelectedGame
  destinations: GameFolderPaths
  session?: GameSession | null
}): ProjectId {
  const id = newProjectId()
  const iso = new Date().toISOString()
  const session = input.session
    ? adaptSessionForProjects(input.session)
    : null
  upsertProject(
    {
      meta: {
        id,
        name: input.name,
        engine: input.engine,
        createdAt: iso,
        lastOpenedAt: iso,
        destinations: input.destinations,
      },
      session,
    },
    { setLast: true },
  )
  return id
}
