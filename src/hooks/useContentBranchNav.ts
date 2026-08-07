import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DisplayNode } from '../lib/selection/visibility'
import { sortContentSubBranches } from '../lib/contentBranchOrder'
import type { AppNavSlot } from '../ui/StationNav'

export function preferredSub(
  main: DisplayNode,
  preferredTag: string | null,
): DisplayNode | null {
  const ordered = sortContentSubBranches(main.children)
  if (preferredTag) {
    const match = ordered.find((c) => c.node.tag === preferredTag)
    if (match) return match
  }
  return ordered[0] ?? null
}

export function useContentBranchNav(args: {
  activeStation: AppNavSlot
  displayNodes: DisplayNode[]
  onClearFocus: () => void
}) {
  const { activeStation, displayNodes, onClearFocus } = args
  const isContentStation = activeStation === 'content'
  const [contentMainKey, setContentMainKey] = useState<string | null>(null)
  const [contentSubKey, setContentSubKey] = useState<string | null>(null)
  const [contentSubTag, setContentSubTag] = useState<string | null>(null)

  const contentMainBranches = isContentStation ? displayNodes : []
  const selectedMain = useMemo(() => {
    if (!contentMainKey) return null
    return contentMainBranches.find((b) => b.node.key === contentMainKey) ?? null
  }, [contentMainBranches, contentMainKey])
  const contentSubBranches = useMemo(
    () => sortContentSubBranches(selectedMain?.children ?? []),
    [selectedMain],
  )
  const selectedSub = useMemo(() => {
    if (!contentSubKey) return null
    return contentSubBranches.find((b) => b.node.key === contentSubKey) ?? null
  }, [contentSubBranches, contentSubKey])
  const listNodes = isContentStation ? (selectedSub?.children ?? []) : displayNodes
  const treeKey = isContentStation
    ? `${activeStation}:${contentMainKey ?? ''}:${contentSubKey ?? ''}`
    : activeStation

  useEffect(() => {
    if (!isContentStation) return
    const mainValid =
      contentMainKey != null &&
      contentMainBranches.some((b) => b.node.key === contentMainKey)
    const main = mainValid
      ? contentMainBranches.find((b) => b.node.key === contentMainKey)!
      : contentMainBranches[0]
    if (!main) {
      if (contentMainKey != null) setContentMainKey(null)
      if (contentSubKey != null) setContentSubKey(null)
      return
    }
    if (!mainValid) {
      const sub = preferredSub(main, contentSubTag)
      setContentMainKey(main.node.key)
      setContentSubKey(sub?.node.key ?? null)
      if (!contentSubTag && sub) setContentSubTag(sub.node.tag)
      return
    }
    const subValid =
      contentSubKey != null &&
      main.children.some((b) => b.node.key === contentSubKey)
    if (!subValid) {
      const sub = preferredSub(main, contentSubTag)
      setContentSubKey(sub?.node.key ?? null)
      if (!contentSubTag && sub) setContentSubTag(sub.node.tag)
    }
  }, [isContentStation, contentMainBranches, contentMainKey, contentSubKey, contentSubTag])

  const selectContentMain = useCallback(
    (key: string) => {
      const main = contentMainBranches.find((b) => b.node.key === key)
      const sub = main ? preferredSub(main, contentSubTag) : null
      setContentMainKey(key)
      setContentSubKey(sub?.node.key ?? null)
      onClearFocus()
    },
    [contentMainBranches, contentSubTag, onClearFocus],
  )

  const selectContentSub = useCallback(
    (key: string) => {
      const sub = contentSubBranches.find((b) => b.node.key === key)
      setContentSubKey(key)
      if (sub) setContentSubTag(sub.node.tag)
      onClearFocus()
    },
    [contentSubBranches, onClearFocus],
  )

  return {
    isContentStation,
    contentMainKey,
    contentSubKey,
    contentSubTag,
    setContentMainKey,
    setContentSubKey,
    setContentSubTag,
    contentMainBranches,
    contentSubBranches,
    selectedSub,
    listNodes,
    treeKey,
    selectContentMain,
    selectContentSub,
  }
}
