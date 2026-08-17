import type { PresetTilePreview } from '../lib/selection/presetPreview'
import type { ComponentNode } from '../lib/xml/schema'

interface Props {
  preview: PresetTilePreview | null
  onNavigateToComponent: (componentId: string) => void
}

function DetailBlock({
  kind,
  title,
  children,
}: {
  kind: 'component' | 'mod' | 'relations'
  title: string
  children: React.ReactNode
}) {
  return (
    <section className={`detail-block detail-block-${kind}`}>
      <h4 className="detail-block-title">{title}</h4>
      <div className="detail-block-body">{children}</div>
    </section>
  )
}

function componentLabel(c: ComponentNode): string {
  return c.attrs.label?.trim() || c.attrs.name?.trim() || c.componentId
}

function ModGroupedList({
  groups,
  onNavigate,
}: {
  groups: PresetTilePreview['groups']['willTick']
  onNavigate: (componentId: string) => void
}) {
  if (groups.length === 0) return null
  return (
    <div className="detail-relations preset-detail-groups">
      {groups.map((group) => (
        <div key={group.modKey} className="detail-relation-group">
          <p className="detail-relation-group-title">{group.modLabel}</p>
          <ul className="detail-relation-list">
            {group.components.map((c) => (
              <li key={c.componentId} className="detail-relation-item">
                <button
                  type="button"
                  className="detail-relation-link"
                  onClick={() => onNavigate(c.componentId)}
                >
                  {componentLabel(c)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function PresetDetail({ preview, onNavigateToComponent }: Props) {
  if (!preview) {
    return (
      <div className="detail-empty-state">
        <p className="detail-empty-title">Nothing focused</p>
        <p className="detail-empty">
          Click a preset tile to preview which components it would tick. Hover to
          peek without changing focus.
        </p>
      </div>
    )
  }

  const willCount = preview.wouldSelect.length
  const alreadyCount = preview.alreadySelected.length
  const blockedCount = preview.blocked.length

  return (
    <article className="component-detail preset-detail">
      <div className="detail-sticky">
        <div className="detail-title-row">
          <h3 className="detail-title">{preview.tileLabel}</h3>
        </div>
        <div className="detail-badges">
          <span
            className={`badge badge-selection badge-selection-${
              preview.tileChecked ? 'checked' : 'unchecked'
            }`}
          >
            {preview.tileChecked ? 'Checked' : 'Unchecked'}
          </span>
          {willCount > 0 && (
            <span className="badge badge-status-required">{willCount} will tick</span>
          )}
          {alreadyCount > 0 && (
            <span className="badge badge-selection badge-selection-checked">
              {alreadyCount} ticked
            </span>
          )}
          {blockedCount > 0 && (
            <span className="badge badge-gated">{blockedCount} blocked</span>
          )}
        </div>
      </div>

      <div className="detail-blocks">
        {willCount > 0 && (
          <DetailBlock kind="component" title="Will tick">
            <p className="preset-detail-lede">
              Components that would be newly selected if this preset is turned on
              from the current selection.
            </p>
            <ModGroupedList
              groups={preview.groups.willTick}
              onNavigate={onNavigateToComponent}
            />
          </DetailBlock>
        )}

        {preview.tileChecked && alreadyCount > 0 && (
          <DetailBlock kind="mod" title="Already ticked">
            <p className="preset-detail-lede">
              Matching components already in your selection via this preset.
            </p>
            <ModGroupedList
              groups={preview.groups.already}
              onNavigate={onNavigateToComponent}
            />
          </DetailBlock>
        )}

        {blockedCount > 0 && (
          <DetailBlock kind="relations" title="Blocked">
            <p className="preset-detail-lede">
              In scope for this preset but not selected — usually waiting on a
              requirement or excluded by an alternatives group.
            </p>
            <ModGroupedList
              groups={preview.groups.blocked}
              onNavigate={onNavigateToComponent}
            />
          </DetailBlock>
        )}

        {willCount === 0 && alreadyCount === 0 && blockedCount === 0 && (
          <DetailBlock kind="component" title="No components">
            <p className="preset-detail-lede">
              This preset has no eligible components for the current engine.
            </p>
          </DetailBlock>
        )}
      </div>
    </article>
  )
}
