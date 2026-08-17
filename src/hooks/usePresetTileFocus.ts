import { useCallback, useMemo, useState } from 'react'
import type { PresetTileRef } from '../lib/selection/presetPreview'
import { presetTilesEqual } from '../lib/selection/presetPreview'

export type { PresetTileRef } from '../lib/selection/presetPreview'

export function usePresetTileFocus() {
  const [focusedTile, setFocusedTile] = useState<PresetTileRef | null>(null)
  const [hoveredTile, setHoveredTile] = useState<PresetTileRef | null>(null)

  const displayTile = useMemo(
    () => hoveredTile ?? focusedTile,
    [hoveredTile, focusedTile],
  )

  const onTileFocus = useCallback((tile: PresetTileRef) => {
    setFocusedTile(tile)
  }, [])

  const onTileHover = useCallback((tile: PresetTileRef | null) => {
    setHoveredTile(tile)
  }, [])

  const isTileFocused = useCallback(
    (tile: PresetTileRef) => presetTilesEqual(displayTile, tile),
    [displayTile],
  )

  return {
    focusedTile,
    hoveredTile,
    displayTile,
    onTileFocus,
    onTileHover,
    isTileFocused,
  }
}
