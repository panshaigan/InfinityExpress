import { useCallback, useEffect, useRef } from 'react'
import type { AppPhase } from '../ui/PhaseNav.types'
import type { SelectedGame } from '../lib/xml/schema'
import {
  mergeAppSession,
  readAppSession,
  writeAppSession,
  type AppSessionStore,
  type GameSession,
} from '../lib/ui/appSessionPrefs'

const SAVE_DEBOUNCE_MS = 400

export function useAppSessionPersistence(args: {
  game: SelectedGame | null
  appPhase: AppPhase
  buildGameSession: () => GameSession | null
}) {
  const { game, appPhase, buildGameSession } = args
  const storeRef = useRef<AppSessionStore>(readAppSession())
  const buildRef = useRef(buildGameSession)
  buildRef.current = buildGameSession

  const flushSession = useCallback(
    (targetGame: SelectedGame | null = game) => {
      if (!targetGame) return
      const session = buildRef.current()
      if (!session) return
      const next = mergeAppSession(storeRef.current, targetGame, session, appPhase)
      storeRef.current = next
      writeAppSession(next)
    },
    [appPhase, game],
  )

  const persistGameSlice = useCallback(
    (targetGame: SelectedGame, phase: AppPhase = appPhase) => {
      const session = buildRef.current()
      if (!session) return
      const next = mergeAppSession(storeRef.current, targetGame, session, phase)
      storeRef.current = next
      writeAppSession(next)
    },
    [appPhase],
  )

  const replaceStore = useCallback((store: AppSessionStore) => {
    storeRef.current = store
    writeAppSession(store)
  }, [])

  useEffect(() => {
    if (!game) return
    const id = window.setTimeout(() => flushSession(game), SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [game, appPhase, flushSession])

  useEffect(() => {
    function onBeforeUnload() {
      flushSession()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushSession])

  return {
    sessionStoreRef: storeRef,
    flushSession,
    persistGameSlice,
    replaceStore,
  }
}
