import {
  isComponentNode,
  type ComponentNode,
  type TreeNode,
} from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import { levelBadgeClass, levelBadgeLabel } from '../lib/levels'

interface Props {
  display: DisplayNode | null
}

function resolveLabel(node: TreeNode, collapsed?: ComponentNode): string {
  return (
    node.attrs.label ??
    (collapsed ? collapsed.attrs.label : undefined) ??
    node.tag
  )
}

export function ComponentDetail({ display }: Props) {
  if (!display) {
    return <p className="detail-empty">Select a component to see details.</p>
  }

  const { node, collapsedComponent } = display
  const source = collapsedComponent ?? node
  const label = resolveLabel(node, collapsedComponent)
  const desc = node.attrs.desc ?? collapsedComponent?.attrs.desc
  const level = collapsedComponent?.effectiveLevel ?? node.effectiveLevel
  const modId = source.attrs.modId ?? node.attrs.modId
  const author = source.attrs.author ?? node.attrs.author
  const comment = source.attrs.comment ?? node.attrs.comment
  const tags = source.attrs.tags ?? node.attrs.tags
  const componentId = collapsedComponent
    ? collapsedComponent.componentId
    : isComponentNode(node)
      ? node.componentId
      : undefined
  const stability = node.attrs.stability ?? collapsedComponent?.attrs.stability

  return (
    <article className="component-detail">
      <h3 className="detail-title">{label}</h3>
      <div className="detail-badges">
        {level && (
          <span className={levelBadgeClass(level)}>{levelBadgeLabel(level)}</span>
        )}
        {stability === 'beta' && <span className="badge">beta</span>}
      </div>
      {desc ? (
        <p className="detail-desc">{desc}</p>
      ) : (
        <p className="detail-empty">No description.</p>
      )}
      <dl className="detail-meta">
        {modId && (
          <>
            <dt>Mod</dt>
            <dd>{modId}</dd>
          </>
        )}
        <dt>Mod URL</dt>
        <dd className="placeholder">Coming later</dd>
        {author && (
          <>
            <dt>Author</dt>
            <dd>{author}</dd>
          </>
        )}
        {componentId && (
          <>
            <dt>Component id</dt>
            <dd>
              <code>{componentId}</code>
            </dd>
          </>
        )}
        {tags && (
          <>
            <dt>Tags</dt>
            <dd>{tags}</dd>
          </>
        )}
        {comment && (
          <>
            <dt>Comment</dt>
            <dd>{comment}</dd>
          </>
        )}
      </dl>
    </article>
  )
}
