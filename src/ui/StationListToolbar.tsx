import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import type { DisplayNode } from '../lib/selection/visibility'
import { collectAllExpandableKeys } from '../lib/ui/treeKeyboard'
import { FoldAllIcon, UnfoldAllIcon } from './FoldAllIcons'
import { IconTip } from './IconTip'

interface Props {
  listNodes: DisplayNode[]
  listState: 'checked' | 'unchecked' | 'indeterminate'
  onToggleAll: (wantSelected: boolean) => void
  onFoldAll: () => void
  onUnfoldAll: () => void
  children?: ReactNode
}

export function StationListToolbar({
  listNodes,
  listState,
  onToggleAll,
  onFoldAll,
  onUnfoldAll,
  children,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [allUnfolded, setAllUnfolded] = useState(false)

  const checked = listState === 'checked'
  const empty = listNodes.length === 0
  const expandableKeys = useMemo(() => collectAllExpandableKeys(listNodes), [listNodes])
  const foldDisabled = empty || expandableKeys.length === 0
  const expandableKeySignature = expandableKeys.join('\0')

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = listState === 'indeterminate'
    }
  }, [listState])

  useEffect(() => {
    setAllUnfolded(false)
  }, [expandableKeySignature])

  function handleSelectAllChange(e: ChangeEvent<HTMLInputElement>) {
    onToggleAll(e.target.checked)
  }

  function handleFoldToggle() {
    if (allUnfolded) {
      onFoldAll()
      setAllUnfolded(false)
    } else {
      onUnfoldAll()
      setAllUnfolded(true)
    }
  }

  const foldLabel = allUnfolded ? 'Fold all' : 'Unfold all'

  return (
    <div className="station-list-toolbar">
      <div className="station-list-toolbar-primary">
        <span className="has-icon-tip">
          <button
            type="button"
            className="station-fold-toggle"
            disabled={foldDisabled}
            aria-label={`${foldLabel} on this list`}
            onClick={handleFoldToggle}
          >
            {allUnfolded ? <FoldAllIcon /> : <UnfoldAllIcon />}
          </button>
          <IconTip>{foldLabel}</IconTip>
        </span>
        <label className={`station-select-all${empty ? ' disabled' : ''}`}>
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={checked}
            disabled={empty}
            aria-label="Select all on this list"
            onChange={handleSelectAllChange}
          />
          <span>Select all</span>
        </label>
        {children}
      </div>
    </div>
  )
}
