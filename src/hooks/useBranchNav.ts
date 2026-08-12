import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DisplayNode } from '../lib/selection/visibility'
import { sortContentSubBranches } from '../lib/contentBranchOrder'
import {
  isBranchNavStation,
  preferredContentSub,
} from '../lib/stationBranchNav'
import type { AppNavSlot } from '../ui/StationNav'

/** @deprecated Prefer preferredContentSub from stationBranchNav. */
export const preferredSub = preferredContentSub

export interface BranchNavInitialState {
  mainKey: string | null
  subKey: string | null
  subTag: string | null
}

export function useBranchNav(args: {
  activeStation: AppNavSlot
  displayNodes: DisplayNode[]
  onClearFocus: () => void
  initialBranchState?: BranchNavInitialState
}) {
  const { activeStation, displayNodes, onClearFocus, initialBranchState } = args
  const branched = isBranchNavStation(activeStation)
  const isContentStation = activeStation === 'content'
  const isMechanicsStation = activeStation === 'mechanics'

  const [mainKey, setMainKey] = useState<string | null>(
    () => initialBranchState?.mainKey ?? null,
  )
  const [subKey, setSubKey] = useState<string | null>(
    () => initialBranchState?.subKey ?? null,
  )
  const [subTag, setSubTag] = useState<string | null>(
    () => initialBranchState?.subTag ?? null,
  )

  const mainBranches = branched ? displayNodes : []
  const selectedMain = useMemo(() => {
    if (!mainKey) return null
    return mainBranches.find((b) => b.node.key === mainKey) ?? null
  }, [mainBranches, mainKey])

  const subBranches = useMemo(() => {
    if (!isContentStation) return []
    return sortContentSubBranches(selectedMain?.children ?? [])
  }, [isContentStation, selectedMain])

  const selectedSub = useMemo(() => {
    if (!subKey) return null
    return subBranches.find((b) => b.node.key === subKey) ?? null
  }, [subBranches, subKey])

  const listNodes = useMemo(() => {
    if (isContentStation) return selectedSub?.children ?? []
    if (isMechanicsStation) return selectedMain?.children ?? []
    return displayNodes
  }, [
    displayNodes,
    isContentStation,
    isMechanicsStation,
    selectedMain,
    selectedSub,
  ])

  const treeKey = isContentStation
    ? `${activeStation}:${mainKey ?? ''}:${subKey ?? ''}`
    : isMechanicsStation
      ? `${activeStation}:${mainKey ?? ''}`
      : activeStation

  useEffect(() => {
    if (!branched) return

    const mainValid =
      mainKey != null && mainBranches.some((b) => b.node.key === mainKey)
    const main = mainValid
      ? mainBranches.find((b) => b.node.key === mainKey)!
      : mainBranches[0]

    if (!main) {
      if (mainKey != null) setMainKey(null)
      if (subKey != null) setSubKey(null)
      return
    }

    if (isMechanicsStation) {
      if (!mainValid) setMainKey(main.node.key)
      if (subKey != null) setSubKey(null)
      return
    }

    // Content: two-level
    if (!mainValid) {
      const sub = preferredContentSub(main, subTag)
      setMainKey(main.node.key)
      setSubKey(sub?.node.key ?? null)
      if (!subTag && sub) setSubTag(sub.node.tag)
      return
    }
    const subValid =
      subKey != null && main.children.some((b) => b.node.key === subKey)
    if (!subValid) {
      const sub = preferredContentSub(main, subTag)
      setSubKey(sub?.node.key ?? null)
      if (!subTag && sub) setSubTag(sub.node.tag)
    }
  }, [
    branched,
    isMechanicsStation,
    mainBranches,
    mainKey,
    subKey,
    subTag,
  ])

  const selectMain = useCallback(
    (key: string) => {
      if (isContentStation) {
        const main = mainBranches.find((b) => b.node.key === key)
        const sub = main ? preferredContentSub(main, subTag) : null
        setMainKey(key)
        setSubKey(sub?.node.key ?? null)
      } else {
        setMainKey(key)
        setSubKey(null)
      }
      onClearFocus()
    },
    [isContentStation, mainBranches, subTag, onClearFocus],
  )

  const selectSub = useCallback(
    (key: string) => {
      const sub = subBranches.find((b) => b.node.key === key)
      setSubKey(key)
      if (sub) setSubTag(sub.node.tag)
      onClearFocus()
    },
    [subBranches, onClearFocus],
  )

  return {
    isBranchNavStation: branched,
    isContentStation,
    isMechanicsStation,
    mainKey,
    subKey,
    subTag,
    setMainKey,
    setSubKey,
    setSubTag,
    mainBranches,
    subBranches,
    selectedMain,
    selectedSub,
    listNodes,
    treeKey,
    selectMain,
    selectSub,
    // Aliases kept for gradual App / route wiring clarity
    contentMainKey: mainKey,
    contentSubKey: subKey,
    contentSubTag: subTag,
    setContentMainKey: setMainKey,
    setContentSubKey: setSubKey,
    setContentSubTag: setSubTag,
    contentMainBranches: mainBranches,
    contentSubBranches: subBranches,
    selectContentMain: selectMain,
    selectContentSub: selectSub,
  }
}

/** @deprecated Use useBranchNav. */
export const useContentBranchNav = useBranchNav
