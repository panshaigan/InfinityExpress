import type { InstallSequenceModel } from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import type { RelationIndex } from '../lib/selection/relations'
import type { ModInfo } from '../lib/mods/loadMods'
import { ComponentDetail, type DetailSelectionState } from './ComponentDetail'
import { DetailResizeHandle } from './DetailResizeHandle'
import { IconTip } from './IconTip'

interface Props {
  collapsed: boolean
  width: number
  onWidthChange: (width: number) => void
  onToggleCollapsed: () => void
  display: DisplayNode | null
  model: InstallSequenceModel
  relationIndex: RelationIndex
  modsByCodename: ReadonlyMap<string, ModInfo>
  selectionState: DetailSelectionState | null
  onNavigateToComponent: (componentId: string) => void
}

export function DetailPane({
  collapsed,
  width,
  onWidthChange,
  onToggleCollapsed,
  display,
  model,
  relationIndex,
  modsByCodename,
  selectionState,
  onNavigateToComponent,
}: Props) {
  return (
    <>
      {!collapsed && (
        <DetailResizeHandle width={width} onWidthChange={onWidthChange} />
      )}
      <aside
        className={`detail-pane${collapsed ? ' collapsed' : ''}`}
        aria-label="Component details"
      >
        {collapsed ? (
          <button
            type="button"
            className="detail-pane-expand has-icon-tip"
            onClick={onToggleCollapsed}
            aria-expanded={false}
            aria-label="Show details"
          >
            <span className="detail-pane-expand-label">Details</span>
            <IconTip>Show details (;)</IconTip>
          </button>
        ) : (
          <>
            <button
              type="button"
              className="detail-pane-chrome detail-pane-chrome-interactive has-icon-tip"
              onClick={onToggleCollapsed}
              aria-expanded={true}
              aria-label="Hide details"
            >
              <span className="detail-pane-chrome-label">Details</span>
              <IconTip>Hide details (;)</IconTip>
            </button>
            <div className="detail-pane-scroll">
              <ComponentDetail
                display={display}
                model={model}
                relationIndex={relationIndex}
                modsByCodename={modsByCodename}
                selectionState={selectionState}
                onNavigateToComponent={onNavigateToComponent}
              />
            </div>
          </>
        )}
      </aside>
    </>
  )
}
