import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import {
  findDisplayByComponentId,
  findDisplayNode,
  findPathToComponent,
} from '../lib/selection/displayTreeQuery'
import { displaySelectionState } from '../lib/selection/selectionEngine'
import { preferredContentSub } from '../lib/stationBranchNav'
import type { AppNavSlot } from '../ui/StationNav'
import type { RelationIndex } from '../lib/selection/relations'

export function useTreeFocus(args: {
  model: InstallSequenceModel
  game: SelectedGame | null
  selectedIds: ReadonlySet<string>
  displayNodes: DisplayNode[]
  activeStation: AppNavSlot
  setActiveStation: (slot: AppNavSlot) => void
  isContentStation: boolean
  isMechanicsStation: boolean
  contentSubTag: string | null
  setContentMainKey: (key: string | null) => void
  setContentSubKey: (key: string | null) => void
  setContentSubTag: (tag: string | null) => void
  relationIndex: RelationIndex
}) {
  const {
    model,
    game,
    selectedIds,
    displayNodes,
    activeStation,
    setActiveStation,
    isContentStation,
    isMechanicsStation,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
    relationIndex,
  } = args

  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [focusedComponentId, setFocusedComponentId] = useState<string | null>(null)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null)

  const clearHover = useCallback(() => {
    setHoveredKey(null)
    setHoveredComponentId(null)
  }, [])

  const clearFocus = useCallback(() => {
    setFocusedKey(null)
    setFocusedComponentId(null)
    setPendingFocusId(null)
    setHoveredKey(null)
    setHoveredComponentId(null)
  }, [])

  useEffect(() => {
    if (!pendingFocusId) return
    if (isContentStation) {
      const path = findPathToComponent(displayNodes, pendingFocusId)
      if (path && path.length >= 2) {
        setContentMainKey(path[0].node.key)
        setContentSubKey(path[1].node.key)
        setContentSubTag(path[1].node.tag)
        setFocusedKey(path[path.length - 1].node.key)
        setFocusedComponentId(null)
      } else if (path && path.length === 1) {
        const sub = preferredContentSub(path[0], contentSubTag)
        setContentMainKey(path[0].node.key)
        setContentSubKey(sub?.node.key ?? null)
        if (!contentSubTag && sub) setContentSubTag(sub.node.tag)
        setFocusedKey(path[0].node.key)
        setFocusedComponentId(null)
      }
      setPendingFocusId(null)
      return
    }
    if (isMechanicsStation) {
      const path = findPathToComponent(displayNodes, pendingFocusId)
      if (path && path.length >= 1) {
        setContentMainKey(path[0].node.key)
        setContentSubKey(null)
        setFocusedKey(path[path.length - 1].node.key)
        setFocusedComponentId(null)
      }
      setPendingFocusId(null)
      return
    }
    const found = findDisplayByComponentId(displayNodes, pendingFocusId)
    if (found) {
      setFocusedKey(found.node.key)
      setFocusedComponentId(null)
    }
    setPendingFocusId(null)
  }, [
    displayNodes,
    pendingFocusId,
    isContentStation,
    isMechanicsStation,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
  ])

  const focusedDisplay = useMemo(() => {
    if (focusedKey) {
      const fromTree = findDisplayNode(displayNodes, focusedKey)
      if (fromTree) return fromTree
    }
    if (focusedComponentId) {
      const component = model.componentsById.get(focusedComponentId)
      if (component) {
        return { node: component, children: [] } satisfies DisplayNode
      }
    }
    return null
  }, [displayNodes, focusedKey, focusedComponentId, model.componentsById])

  const focusedSelectionState = useMemo(() => {
    if (!focusedDisplay || !game) return null
    return displaySelectionState(focusedDisplay, selectedIds, game)
  }, [focusedDisplay, game, selectedIds])

  const detailDisplay = useMemo(() => {
    if (hoveredKey) {
      const fromTree = findDisplayNode(displayNodes, hoveredKey)
      if (fromTree) return fromTree
    }
    if (hoveredComponentId) {
      const component = model.componentsById.get(hoveredComponentId)
      if (component) {
        return { node: component, children: [] } satisfies DisplayNode
      }
    }
    return focusedDisplay
  }, [
    displayNodes,
    hoveredKey,
    hoveredComponentId,
    model.componentsById,
    focusedDisplay,
  ])

  const detailSelectionState = useMemo(() => {
    if (!detailDisplay || !game) return null
    return displaySelectionState(detailDisplay, selectedIds, game)
  }, [detailDisplay, game, selectedIds])

  const onFocus = useCallback((key: string) => {
    setFocusedKey(key)
    setFocusedComponentId(null)
    setPendingFocusId(null)
  }, [])

  const onFocusSearchResult = useCallback((componentId: string) => {
    setFocusedKey(null)
    setFocusedComponentId(componentId)
    setPendingFocusId(null)
  }, [])

  const onHover = useCallback((key: string | null) => {
    setHoveredKey(key)
    setHoveredComponentId(null)
  }, [])

  const onHoverSearchResult = useCallback((componentId: string | null) => {
    setHoveredKey(null)
    setHoveredComponentId(componentId)
  }, [])

  const onNavigateToComponent = useCallback(
    (componentId: string) => {
      const station = relationIndex.stationByComponentId.get(componentId)
      if (!station) return
      setFocusedKey(null)
      setFocusedComponentId(componentId)
      setPendingFocusId(componentId)
      if (activeStation !== station) {
        setActiveStation(station)
      }
    },
    [activeStation, relationIndex.stationByComponentId, setActiveStation],
  )

  return {
    focusedKey,
    focusedComponentId,
    focusedDisplay,
    focusedSelectionState,
    detailDisplay,
    detailSelectionState,
    clearFocus,
    clearHover,
    onFocus,
    onFocusSearchResult,
    onHover,
    onHoverSearchResult,
    onNavigateToComponent,
  }
}
