import { useMemo } from 'react'
import modsCsv from '../data/mods.csv?raw'
import {
  isComponentNode,
  type ComponentNode,
  type InstallSequenceModel,
  type TreeNode,
} from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import {
  buildRelationIndex,
  resolveRelations,
  type RelatedRef,
} from '../lib/selection/relations'
import { levelBadgeClass, levelBadgeLabel } from '../lib/levels'
import { parseModsCsv, resolveModLookupKey } from '../lib/mods/loadMods'

const modsByCodename = parseModsCsv(modsCsv)

interface Props {
  display: DisplayNode | null
  model: InstallSequenceModel
  onNavigateToComponent?: (componentId: string) => void
}

function resolveLabel(node: TreeNode, collapsed?: ComponentNode): string {
  return (
    node.attrs.label ??
    (collapsed ? collapsed.attrs.label : undefined) ??
    node.tag
  )
}

function splitTags(tags: string | undefined): string[] {
  if (!tags?.trim()) return []
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function RelationRow({
  label,
  refs,
  onNavigate,
}: {
  label: string
  refs: RelatedRef[]
  onNavigate?: (componentId: string) => void
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="detail-relation-list">
        {refs.map((ref, i) => (
          <span key={ref.id}>
            {i > 0 && ', '}
            {ref.navigable && onNavigate ? (
              <button
                type="button"
                className="detail-relation-link"
                onClick={() => onNavigate(ref.id)}
              >
                {ref.label}
              </button>
            ) : (
              <span>{ref.label}</span>
            )}
          </span>
        ))}
      </dd>
    </>
  )
}

const RELATION_ROWS: { key: keyof ReturnType<typeof resolveRelations>; label: string }[] = [
  { key: 'autoIncludedWhen', label: 'Auto-included when' },
  { key: 'autoIncludes', label: 'Auto-includes' },
  { key: 'shownWhen', label: 'Shown when' },
  { key: 'unlocks', label: 'Unlocks' },
  { key: 'hiddenWhen', label: 'Hidden when' },
  { key: 'hides', label: 'Hides' },
]

export function ComponentDetail({ display, model, onNavigateToComponent }: Props) {
  const relationIndex = useMemo(() => buildRelationIndex(model), [model])

  if (!display) {
    return <p className="detail-empty">Select a component to see details.</p>
  }

  const { node, collapsedComponent } = display
  const source = collapsedComponent ?? node
  const label = resolveLabel(node, collapsedComponent)
  const desc = node.attrs.desc ?? collapsedComponent?.attrs.desc
  const level = collapsedComponent?.effectiveLevel ?? node.effectiveLevel
  const author = source.attrs.author ?? node.attrs.author
  const tagList = splitTags(source.attrs.tags ?? node.attrs.tags)
  const componentId = collapsedComponent
    ? collapsedComponent.componentId
    : isComponentNode(node)
      ? node.componentId
      : undefined
  const stability = node.attrs.stability ?? collapsedComponent?.attrs.stability
  const attrs = source.attrs

  const codename = resolveModLookupKey(model, source)
  const mod = codename ? modsByCodename.get(codename) : undefined

  const relations = resolveRelations(model, relationIndex, attrs, componentId)
  const hasRelations = RELATION_ROWS.some((row) => relations[row.key].length > 0)

  return (
    <article className="component-detail">
      <h3 className="detail-title">{label}</h3>
      <div className="detail-badges">
        {level && (
          <span className={levelBadgeClass(level)}>{levelBadgeLabel(level)}</span>
        )}
        {stability === 'beta' && <span className="badge">beta</span>}
        {attrs.required && <span className="badge">required</span>}
        {attrs.noDisplay && <span className="badge">hidden</span>}
        {attrs.core && <span className="badge">core</span>}
        {attrs.default && <span className="badge">default</span>}
        {tagList.map((tag) => (
          <span key={tag} className="badge">
            {tag}
          </span>
        ))}
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
      </dl>
      {hasRelations && (
        <dl className="detail-meta detail-relations">
          {RELATION_ROWS.map(({ key, label: rowLabel }) => {
            const refs = relations[key]
            if (refs.length === 0) return null
            return (
              <RelationRow
                key={key}
                label={rowLabel}
                refs={refs}
                onNavigate={onNavigateToComponent}
              />
            )
          })}
        </dl>
      )}
    </article>
  )
}
