import { useState, type Dispatch, type SetStateAction } from 'react'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import {
  setRecommendedSelection,
  setPackageSelection,
} from '../lib/selection/selectionEngine'

export interface RecommendedPresetsInitialState {
  recommendedChecked: readonly string[]
  packagesChecked: readonly string[]
}

export function useRecommendedPresets(args: {
  model: InstallSequenceModel
  game: SelectedGame | null
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  initialState?: RecommendedPresetsInitialState
}) {
  const { model, game, setSelectedIds, initialState } = args

  const [checkedRecommended, setCheckedRecommended] = useState<Set<string>>(
    () => new Set(initialState?.recommendedChecked ?? []),
  )
  const [checkedPackages, setCheckedPackages] = useState<Set<string>>(
    () => new Set(initialState?.packagesChecked ?? []),
  )

  function onRecommendedToggle(token: string, wantChecked: boolean) {
    if (!game) return
    setCheckedRecommended((prev) => {
      const next = new Set(prev)
      if (wantChecked) next.add(token)
      else next.delete(token)
      setSelectedIds((prevSelected) =>
        setRecommendedSelection(model, prevSelected, game, token, wantChecked),
      )
      return next
    })
  }

  function onPackageToggle(token: string, wantChecked: boolean) {
    if (!game) return
    setCheckedPackages((prev) => {
      const next = new Set(prev)
      if (wantChecked) next.add(token)
      else next.delete(token)
      setSelectedIds((prevSelected) =>
        setPackageSelection(model, prevSelected, game, token, wantChecked),
      )
      return next
    })
  }

  function resetRecommendedPresets() {
    setCheckedRecommended(new Set())
    setCheckedPackages(new Set())
  }

  function restoreRecommendedState(state: RecommendedPresetsInitialState) {
    setCheckedRecommended(new Set(state.recommendedChecked))
    setCheckedPackages(new Set(state.packagesChecked))
  }

  function seedFixesBaseline(game: SelectedGame) {
    const fixes = new Set<string>(['fixes'])
    setCheckedRecommended(fixes)
    setCheckedPackages(new Set())
    setSelectedIds((prev) => setRecommendedSelection(model, prev, game, 'fixes', true))
  }

  return {
    checkedRecommended,
    setCheckedRecommended,
    checkedPackages,
    setCheckedPackages,
    onRecommendedToggle,
    onPackageToggle,
    resetRecommendedPresets,
    restoreRecommendedState,
    seedFixesBaseline,
  }
}
