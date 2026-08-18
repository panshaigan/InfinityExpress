import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { SelectedGame } from '../lib/xml/schema'
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
import { useAutoDismiss } from './useAutoDismiss'

export function useSelectionPresetsState(args: {
  game: SelectedGame | null
  selectedIds: ReadonlySet<string>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  recommendedChecked: ReadonlySet<string>
  setRecommendedChecked: Dispatch<SetStateAction<Set<string>>>
  packagesChecked: ReadonlySet<string>
  setPackagesChecked: Dispatch<SetStateAction<Set<string>>>
  initialPresets?: readonly SelectionPreset[]
  initialActivePresetId?: string | null
  initialPresetBaseline?: string | null
}) {
  const {
    game,
    selectedIds,
    setSelectedIds,
    recommendedChecked,
    setRecommendedChecked,
    packagesChecked,
    setPackagesChecked,
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
      recommendedChecked,
      packagesChecked,
    })
  }, [
    game,
    selectedIds,
    recommendedChecked,
    packagesChecked,
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
      recommendedChecked,
      packagesChecked,
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
    setRecommendedChecked(applied.recommendedChecked)
    setPackagesChecked(applied.packagesChecked)
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
