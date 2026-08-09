import { useState, type Dispatch, type SetStateAction } from 'react'
import type { InstallSequenceModel, SelectedGame, StationId } from '../lib/xml/schema'
import { toggleLadderPrefix, type LadderLevel } from '../lib/levels'
import {
  applyGlobalLevelBaseline,
  applyLadderLevelSelection,
  setDifficultySelection,
} from '../lib/selection/selectionEngine'
import { componentIdsForStation, type RelationIndex } from '../lib/selection/relations'
import { emptyLiveStationPreset } from '../lib/presets/selectionPresets'
import { isSetupSlot } from '../lib/ui/chromeHotkeys'
import type { AppNavSlot } from '../ui/StationNav'

export type StationLevelMap = Map<
  StationId,
  {
    ladder: Set<LadderLevel>
    lowerDifficulty: boolean
    higherDifficulty: boolean
  }
>

export function useLevelPresets(args: {
  model: InstallSequenceModel
  game: SelectedGame | null
  activeStation: AppNavSlot
  relationIndex: RelationIndex
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
}) {
  const { model, game, activeStation, relationIndex, setSelectedIds } = args

  const [ladderChecked, setLadderChecked] = useState<Set<LadderLevel>>(() => new Set())
  const [lowerDifficultyPreset, setLowerDifficultyPreset] = useState(false)
  const [higherDifficultyPreset, setHigherDifficultyPreset] = useState(false)
  /** Last Engine-applied baseline; used by station “Reset to global”. */
  const [lastGlobalLadder, setLastGlobalLadder] = useState<Set<LadderLevel>>(() => new Set())
  const [lastGlobalLowerDifficulty, setLastGlobalLowerDifficulty] = useState(false)
  const [lastGlobalHigherDifficulty, setLastGlobalHigherDifficulty] = useState(false)
  const [stationLevelPresets, setStationLevelPresets] = useState<StationLevelMap>(
    () => new Map(),
  )

  const activeStationPreset =
    isSetupSlot(activeStation)
      ? emptyLiveStationPreset()
      : (stationLevelPresets.get(activeStation) ?? emptyLiveStationPreset())

  function onLadderToggle(level: LadderLevel, wantChecked: boolean) {
    if (!game) return
    setLadderChecked((prev) => {
      const next = toggleLadderPrefix(prev, level, wantChecked)
      if (!next) return prev
      setLastGlobalLadder(new Set(next))
      setSelectedIds((prevSelected) =>
        applyLadderLevelSelection(model, prevSelected, game, next),
      )
      return next
    })
  }

  function onDifficultyPresetChange(
    token: 'lowerDifficulty' | 'higherDifficulty',
    want: boolean,
  ) {
    if (!game) return
    if (token === 'lowerDifficulty') {
      setLowerDifficultyPreset(want)
      setLastGlobalLowerDifficulty(want)
    } else {
      setHigherDifficultyPreset(want)
      setLastGlobalHigherDifficulty(want)
    }
    setSelectedIds((prev) => setDifficultySelection(model, prev, game, token, want))
  }

  function onStationLadderToggle(level: LadderLevel, wantChecked: boolean) {
    if (!game || isSetupSlot(activeStation)) return
    const stationId = activeStation
    const scope = componentIdsForStation(relationIndex.stationByComponentId, stationId)
    setStationLevelPresets((prev) => {
      const current = prev.get(stationId) ?? emptyLiveStationPreset()
      const nextLadder = toggleLadderPrefix(current.ladder, level, wantChecked)
      if (!nextLadder) return prev
      const next = new Map(prev)
      next.set(stationId, {
        ladder: nextLadder,
        lowerDifficulty: current.lowerDifficulty,
        higherDifficulty: current.higherDifficulty,
      })
      setSelectedIds((prevSelected) =>
        applyLadderLevelSelection(model, prevSelected, game, nextLadder, scope),
      )
      return next
    })
  }

  function onStationDifficultyChange(
    token: 'lowerDifficulty' | 'higherDifficulty',
    want: boolean,
  ) {
    if (!game || isSetupSlot(activeStation)) return
    const stationId = activeStation
    const scope = componentIdsForStation(relationIndex.stationByComponentId, stationId)
    setStationLevelPresets((prev) => {
      const current = prev.get(stationId) ?? emptyLiveStationPreset()
      const next = new Map(prev)
      next.set(stationId, {
        ladder: new Set(current.ladder),
        lowerDifficulty:
          token === 'lowerDifficulty' ? want : current.lowerDifficulty,
        higherDifficulty:
          token === 'higherDifficulty' ? want : current.higherDifficulty,
      })
      return next
    })
    setSelectedIds((prev) => setDifficultySelection(model, prev, game, token, want, scope))
  }

  function onClearToGlobal() {
    if (!game || isSetupSlot(activeStation)) return
    const stationId = activeStation
    const scope = componentIdsForStation(relationIndex.stationByComponentId, stationId)
    setSelectedIds((prev) =>
      applyGlobalLevelBaseline(
        model,
        prev,
        game,
        lastGlobalLadder,
        lastGlobalLowerDifficulty,
        lastGlobalHigherDifficulty,
        scope,
      ),
    )
    setStationLevelPresets((prev) => {
      const next = new Map(prev)
      next.set(stationId, {
        ladder: new Set(lastGlobalLadder),
        lowerDifficulty: lastGlobalLowerDifficulty,
        higherDifficulty: lastGlobalHigherDifficulty,
      })
      return next
    })
  }

  function resetLevelPresets() {
    setLadderChecked(new Set())
    setLowerDifficultyPreset(false)
    setHigherDifficultyPreset(false)
    setLastGlobalLadder(new Set())
    setLastGlobalLowerDifficulty(false)
    setLastGlobalHigherDifficulty(false)
    setStationLevelPresets(new Map())
  }

  /** Default Engine/Levels baseline: Fixes checked, difficulty off. */
  function seedFixesBaseline(game: SelectedGame) {
    const fixes = new Set<LadderLevel>(['fixes'])
    setLadderChecked(new Set(fixes))
    setLastGlobalLadder(new Set(fixes))
    setLowerDifficultyPreset(false)
    setHigherDifficultyPreset(false)
    setLastGlobalLowerDifficulty(false)
    setLastGlobalHigherDifficulty(false)
    setStationLevelPresets(new Map())
    setSelectedIds((prev) => applyLadderLevelSelection(model, prev, game, fixes))
  }

  return {
    ladderChecked,
    setLadderChecked,
    lowerDifficultyPreset,
    setLowerDifficultyPreset,
    higherDifficultyPreset,
    setHigherDifficultyPreset,
    lastGlobalLadder,
    setLastGlobalLadder,
    lastGlobalLowerDifficulty,
    setLastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty,
    setLastGlobalHigherDifficulty,
    stationLevelPresets,
    setStationLevelPresets,
    activeStationPreset,
    onLadderToggle,
    onDifficultyPresetChange,
    onStationLadderToggle,
    onStationDifficultyChange,
    onClearToGlobal,
    resetLevelPresets,
    seedFixesBaseline,
  }
}
