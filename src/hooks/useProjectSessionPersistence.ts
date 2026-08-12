import { useCallback, useEffect, useRef } from 'react'
import type { AppPhase } from '../ui/PhaseNav.types'
import type { GameSession } from '../lib/ui/appSessionPrefs'
import {
  readProjectIndex,
  saveProjectSession,
  type ProjectId,
  type ProjectIndex,
} from '../lib/projects'

const SAVE_DEBOUNCE_MS = 400

export function useProjectSessionPersistence(args: {
  projectId: ProjectId | null
  appPhase: AppPhase
  buildGameSession: () => GameSession | null
  onIndexChange?: (index: ProjectIndex) => void
}) {
  const { projectId, appPhase, buildGameSession, onIndexChange } = args
  const indexRef = useRef<ProjectIndex>(readProjectIndex())
  const buildRef = useRef(buildGameSession)
  buildRef.current = buildGameSession
  const phaseRef = useRef(appPhase)
  phaseRef.current = appPhase

  const flushSession = useCallback(
    (targetId: ProjectId | null = projectId) => {
      if (!targetId) return
      const session = buildRef.current()
      if (!session) return
      const next = saveProjectSession(targetId, session)
      indexRef.current = next
      onIndexChange?.(next)
    },
    [projectId, onIndexChange],
  )

  useEffect(() => {
    if (!projectId) return
    const id = window.setTimeout(() => flushSession(projectId), SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [projectId, appPhase, flushSession])

  useEffect(() => {
    function onBeforeUnload() {
      flushSession()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushSession])

  return {
    projectIndexRef: indexRef,
    flushSession,
  }
}
