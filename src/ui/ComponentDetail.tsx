import modsCsv from '../data/mods.csv?raw'
import {
  isComponentNode,
  type ComponentNode,
  type InstallSequenceModel,
  type TreeNode,
} from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import { levelBadgeClass, levelBadgeLabel } from '../lib/levels'
import { parseModsCsv, resolveModLookupKey } from '../lib/mods/loadMods'

const modsByCodename = parseModsCsv(modsCsv)

interface Props {
  display: DisplayNode | null
  model: InstallSequenceModel
}

function resolveLabel(node: TreeNode, collapsed?: ComponentNode): string {
  return (
    node.attrs.label ??
    (collapsed ? collapsed.attrs.label : undefined) ??
    node.tag
  )
}

export function ComponentDetail({ display, model }: Props) {
  if (!display) {
    return <p className="detail-empty">Select a component to see details.</p>
  }

  const { node, collapsedComponent } = display
  const source = collapsedComponent ?? node
  const label = resolveLabel(node, collapsedComponent)
  const desc = node.attrs.desc ?? collapsedComponent?.attrs.desc
  const level = collapsedComponent?.effectiveLevel ?? node.effectiveLevel
  const author = source.attrs.author ?? node.attrs.author
  const tags = source.attrs.tags ?? node.attrs.tags
  const componentId = collapsedComponent
    ? collapsedComponent.componentId
    : isComponentNode(node)
      ? node.componentId
      : undefined
  const stability = node.attrs.stability ?? collapsedComponent?.attrs.stability

  const codename = resolveModLookupKey(model, source)
  const mod = codename ? modsByCodename.get(codename) : undefined

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
        {codename && (
          <>
            <dt>Codename</dt>
            <dd>{codename}</dd>
            {mod?.url && (
              <>
                <dt>URL</dt>
                <dd>
                  <a href={mod.url} target="_blank" rel="noopener noreferrer">
                    {mod.url}
                  </a>
                </dd>
              </>
            )}
            {mod?.release && (
              <>
                <dt>Release</dt>
                <dd>{mod.release}</dd>
              </>
            )}
            {mod?.version && (
              <>
                <dt>Version</dt>
                <dd>{mod.version}</dd>
              </>
            )}
          </>
        )}
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
      </dl>
    </article>
  )
}
