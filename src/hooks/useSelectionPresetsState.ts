import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { SelectedGame, StationId } from '../lib/xml/schema'
import type { LadderLevel } from '../lib/levels'
import { diffSelectedIds } from '../lib/presets/diffSelectedIds'
import {
  applySelectionPreset,
  autoPresetName,
  fingerprintFromLive,
  fingerprintFromPreset,
  newPresetId,
  presetsForGame,
  snapshotSelectionPreset,
  uniquePresetName,
  type SelectionPreset,
} from '../lib/presets/selectionPresets'
import type { StationLevelMap } from './useLevelPresets'
import { useAutoDismiss } from './useAutoDismiss'

export function useSelectionPresetsState(args: {
  game: SelectedGame | null
  selectedIds: ReadonlySet<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  ladderChecked: ReadonlySet<LadderLevel>
  setLadderChecked: Dispatch<SetStateAction<Set<LadderLevel>>>
  lowerDifficultyPreset: boolean
  setLowerDifficultyPreset: Dispatch<SetStateAction<boolean>>
  higherDifficultyPreset: boolean
  setHigherDifficultyPreset: Dispatch<SetStateAction<boolean>>
  lastGlobalLadder: ReadonlySet<LadderLevel>
  setLastGlobalLadder: Dispatch<SetStateAction<Set<LadderLevel>>>
  lastGlobalLowerDifficulty: boolean
  setLastGlobalLowerDifficulty: Dispatch<SetStateAction<boolean>>
  lastGlobalHigherDifficulty: boolean
  setLastGlobalHigherDifficulty: Dispatch<SetStateAction<boolean>>
  stationLevelPresets: StationLevelMap
  setStationLevelPresets: Dispatch<SetStateAction<StationLevelMap>>
  initialPresets?: readonly SelectionPreset[]
  initialActivePresetId?: string | null
  initialPresetBaseline?: string | null
}) {
  const {
    game,
    selectedIds,
    setSelectedIds,
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
    initialPresets,
    initialActivePresetId,
    initialPresetBaseline,
  } = args

  const [selectionPresets, setSelectionPresets] = useState<SelectionPreset[]>(
    () => [...(initialPresets ?? [])],
  )
  const [activePresetId, setActivePresetId] = useState<string | null>(
    () => initialActivePresetId ?? null,
  )
  const [presetBaseline, setPresetBaseline] = useState<string | null>(
    () => initialPresetBaseline ?? null,
  )
  const [presetNotice, setPresetNotice] = useState<{
    name: string
    added: number
    removed: number
  } | null>(null)

  const clearPresetNotice = useCallback(() => setPresetNotice(null), [])
  useAutoDismiss(presetNotice, clearPresetNotice)

  const gamePresets = useMemo(
    () => (game ? presetsForGame(selectionPresets, game) : []),
    [game, selectionPresets],
  )
  const activePreset = useMemo(
    () =>
      activePresetId != null
        ? selectionPresets.find((p) => p.id === activePresetId) ?? null
        : null,
    [activePresetId, selectionPresets],
  )
  const liveFingerprint = useMemo(() => {
    if (!game) return null
    return fingerprintFromLive({
      game,
      selectedIds,
      ladderChecked,
      lowerDifficulty: lowerDifficultyPreset,
      higherDifficulty: higherDifficultyPreset,
      lastGlobalLadder,
      lastGlobalLowerDifficulty,
      lastGlobalHigherDifficulty,
      stationLevelPresets,
    })
  }, [
    game,
    selectedIds,
    ladderChecked,
    lowerDifficultyPreset,
    higherDifficultyPreset,
    lastGlobalLadder,
    lastGlobalLowerDifficulty,
    lastGlobalHigherDifficulty,
    stationLevelPresets,
  ])
  const presetDirty =
    activePresetId != null &&
    presetBaseline != null &&
    liveFingerprint != null &&
    liveFingerprint !== presetBaseline

  function livePresetInput(forGame: SelectedGame) {
    return {
      game: forGame,
      selectedIds,
      ladderChecked,
      lowerDifficulty: lowerDifficultyPreset,
      higherDifficulty: higherDifficultyPreset,
      lastGlobalLadder,
      lastGlobalLowerDifficulty,
      lastGlobalHigherDifficulty,
      stationLevelPresets,
    }
  }

  function saveSelectionPreset() {
    if (!game) return
    const input = livePresetInput(game)
    const active =
      activePresetId != null
        ? selectionPresets.find((p) => p.id === activePresetId && p.game === game)
        : undefined
    if (active) {
      const updated = snapshotSelectionPreset(active.id, active.name, input)
      setSelectionPresets((prev) => prev.map((p) => (p.id === active.id ? updated : p)))
      setPresetBaseline(fingerprintFromPreset(updated))
      return
    }
    const names = presetsForGame(selectionPresets, game).map((p) => p.name)
    const name = uniquePresetName(autoPresetName(game, selectedIds.size), names)
    const created = snapshotSelectionPreset(newPresetId(), name, input)
    setSelectionPresets((prev) => [...prev, created])
    setActivePresetId(created.id)
    setPresetBaseline(fingerprintFromPreset(created))
  }

  function loadSelectionPreset(id: string | null) {
    if (id == null) {
      setActivePresetId(null)
      setPresetBaseline(null)
      return
    }
    if (!game) return
    const preset = selectionPresets.find((p) => p.id === id && p.game === game)
    if (!preset) return
    const before = selectedIds
    const applied = applySelectionPreset(preset)
    const delta = diffSelectedIds(before, applied.selectedIds)
    setSelectedIds(applied.selectedIds)
    setLadderChecked(applied.ladderChecked)
    setLowerDifficultyPreset(applied.lowerDifficulty)
    setHigherDifficultyPreset(applied.higherDifficulty)
    setLastGlobalLadder(applied.lastGlobalLadder)
    setLastGlobalLowerDifficulty(applied.lastGlobalLowerDifficulty)
    setLastGlobalHigherDifficulty(applied.lastGlobalHigherDifficulty)
    setStationLevelPresets(() => {
      const next: StationLevelMap = new Map()
      for (const [key, value] of applied.stationLevelPresets) {
        next.set(key as StationId, value)
      }
      return next
    })
    setActivePresetId(preset.id)
    setPresetBaseline(fingerprintFromPreset(preset))
    setPresetNotice({
      name: preset.name,
      added: delta.added,
      removed: delta.removed,
    })
  }

  function renameSelectionPreset(name: string) {
    if (!activePresetId || !game) return
    setSelectionPresets((prev) => {
      const current = prev.find((p) => p.id === activePresetId)
      if (!current) return prev
      const others = presetsForGame(prev, game)
        .filter((p) => p.id !== activePresetId)
        .map((p) => p.name)
      const unique = uniquePresetName(name, others)
      return prev.map((p) => (p.id === activePresetId ? { ...p, name: unique } : p))
    })
  }

  function deleteSelectionPreset() {
    if (!activePresetId) return
    setSelectionPresets((prev) => prev.filter((p) => p.id !== activePresetId))
    setActivePresetId(null)
    setPresetBaseline(null)
  }

  function resetPresetSelection() {
    setActivePresetId(null)
    setPresetBaseline(null)
  }

  function restoreSelectionPresetsState(input: {
    presets: readonly SelectionPreset[]
    activePresetId: string | null
    presetBaseline: string | null
  }) {
    setSelectionPresets([...input.presets])
    setActivePresetId(input.activePresetId)
    setPresetBaseline(input.presetBaseline)
  }

  return {
    gamePresets,
    allSelectionPresets: selectionPresets,
    activePreset,
    activePresetId,
    presetBaseline,
    presetDirty,
    presetNotice,
    setPresetNotice,
    saveSelectionPreset,
    loadSelectionPreset,
    renameSelectionPreset,
    deleteSelectionPreset,
    resetPresetSelection,
    restoreSelectionPresetsState,
  }
}
