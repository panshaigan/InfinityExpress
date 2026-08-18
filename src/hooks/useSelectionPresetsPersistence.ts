import { useCallback, useEffect, useRef } from 'react'
import type { SelectedGame } from '../lib/xml/schema'
import type { SelectionPreset } from '../lib/presets/selectionPresets'
import { savePresetsForEngine } from '../lib/presets/selectionPresetsStore'

const SAVE_DEBOUNCE_MS = 400

export function useSelectionPresetsPersistence(args: {
  game: SelectedGame | null
  presets: readonly SelectionPreset[]
}) {
  const { game, presets } = args
  const presetsRef = useRef(presets)
  presetsRef.current = presets
  const gameRef = useRef(game)
  gameRef.current = game

  const flushPresets = useCallback(() => {
    const currentGame = gameRef.current
    if (!currentGame) return
    savePresetsForEngine(currentGame, presetsRef.current)
  }, [])

  useEffect(() => {
    if (!game) return
    const id = window.setTimeout(flushPresets, SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [game, presets, flushPresets])

  useEffect(() => {
    function onBeforeUnload() {
      flushPresets()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushPresets])

  return { flushPresets }
}
