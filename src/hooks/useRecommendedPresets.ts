import { useState, type Dispatch, type SetStateAction } from 'react'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import { applyPresetGroupToCheckedSets } from '../lib/recommended/presetGroups'
import {
  setRecommendedSelection,
  setPackageSelection,
  applyCheckedPresetTiles,
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
    const packages = checkedPackages
    setCheckedRecommended((prev) => {
      const next = new Set(prev)
      if (wantChecked) next.add(token)
      else next.delete(token)
      setSelectedIds((prevSelected) => {
        if (!wantChecked) {
          return setRecommendedSelection(model, prevSelected, game, token, false)
        }
        return applyCheckedPresetTiles(model, prevSelected, game, next, packages)
      })
      return next
    })
  }

  function onPackageToggle(token: string, wantChecked: boolean) {
    if (!game) return
    const recommended = checkedRecommended
    setCheckedPackages((prev) => {
      const next = new Set(prev)
      if (wantChecked) next.add(token)
      else next.delete(token)
      setSelectedIds((prevSelected) => {
        if (!wantChecked) {
          return setPackageSelection(model, prevSelected, game, token, false)
        }
        return applyCheckedPresetTiles(model, prevSelected, game, recommended, next)
      })
      return next
    })
  }

  function onPresetGroupToggle(
    recommendedTokens: readonly string[],
    packageTokens: readonly string[],
    wantChecked: boolean,
  ) {
    if (!game) return
    const applied = applyPresetGroupToCheckedSets(
      checkedRecommended,
      checkedPackages,
      recommendedTokens,
      packageTokens,
      wantChecked,
    )
    setCheckedRecommended(applied.recommended)
    setCheckedPackages(applied.packages)
    setSelectedIds((prevSelected) => {
      if (wantChecked) {
        return applyCheckedPresetTiles(
          model,
          prevSelected,
          game,
          applied.recommended,
          applied.packages,
        )
      }
      let next = prevSelected
      for (const token of recommendedTokens) {
        next = setRecommendedSelection(model, next, game, token, false)
      }
      for (const token of packageTokens) {
        next = setPackageSelection(model, next, game, token, false)
      }
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
    onPresetGroupToggle,
    resetRecommendedPresets,
    restoreRecommendedState,
    seedFixesBaseline,
  }
}
