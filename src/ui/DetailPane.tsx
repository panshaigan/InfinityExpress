import type { InstallSequenceModel } from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import type { RelationIndex } from '../lib/selection/relations'
import type { ModInfo } from '../lib/mods/loadMods'
import { ComponentDetail, type DetailSelectionState } from './ComponentDetail'
import { DetailResizeHandle } from './DetailResizeHandle'

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
            className="detail-pane-expand"
            onClick={onToggleCollapsed}
            title="Show details (;)"
            aria-expanded={false}
          >
            <span className="detail-pane-expand-label">Details</span>
          </button>
        ) : (
          <>
            <div className="detail-pane-chrome">
              <span className="detail-pane-chrome-label">Details</span>
              <button
                type="button"
                className="detail-pane-collapse"
                onClick={onToggleCollapsed}
                title="Hide details (;)"
                aria-expanded={true}
                aria-label="Hide details"
              >
                »
              </button>
            </div>
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
