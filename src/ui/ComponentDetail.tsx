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
import {
  splitTags,
  stabilityBadgeLabel,
} from '../lib/selection/filterDisplayTree'
import {
  formatBytes,
  parseModsCsv,
  resolveModLookupKey,
} from '../lib/mods/loadMods'
import { isHttpUrl } from '../lib/url'

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

function RelationSection({
  label,
  refs,
  onNavigate,
}: {
  label: string
  refs: RelatedRef[]
  onNavigate?: (componentId: string) => void
}) {
  return (
    <section className="detail-relation-section">
      <h4 className="detail-relation-heading">{label}</h4>
      <ul className="detail-relation-list">
        {refs.map((ref) => (
          <li key={ref.id} className="detail-relation-item">
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
          </li>
        ))}
      </ul>
    </section>
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
  const tagList = splitTags(source.attrs.tags ?? node.attrs.tags)
  const componentId = collapsedComponent
    ? collapsedComponent.componentId
    : isComponentNode(node)
      ? node.componentId
      : undefined
  const stability = node.attrs.stability ?? collapsedComponent?.attrs.stability
  const stabilityLabel = stabilityBadgeLabel(stability)
  const attrs = source.attrs

  const codename = resolveModLookupKey(model, source)
  const mod = codename ? modsByCodename.get(codename) : undefined
  const componentReadme = attrs.readme
  const modReadme = mod?.readme

  const relations = resolveRelations(model, relationIndex, attrs, componentId)
  const hasRelations = RELATION_ROWS.some((row) => relations[row.key].length > 0)

  return (
    <article className="component-detail">
      <h3 className="detail-title">{label}</h3>
      <div className="detail-badges">
        {level && (
          <span className={levelBadgeClass(level)}>{levelBadgeLabel(level)}</span>
        )}
        {stabilityLabel && <span className="badge">{stabilityLabel}</span>}
        {attrs.required && <span className="badge">required</span>}
        {attrs.noDisplay && <span className="badge">hidden</span>}
        {!collapsedComponent && attrs.core && (
          <span className="badge">core</span>
        )}
        {!collapsedComponent && attrs.default && (
          <span className="badge">default</span>
        )}
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
            <dt>Mod</dt>
            <dd>{codename}</dd>
            {mod?.url && (
              <>
                <dt>URL</dt>
                <dd>
                  <a
                    className="detail-url"
                    href={mod.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {mod.url}
                  </a>
                </dd>
              </>
            )}
            {isHttpUrl(modReadme) && (
              <>
                <dt>Mod Readme</dt>
                <dd>
                  <a
                    className="detail-url"
                    href={modReadme}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {modReadme}
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
            {mod?.sizeBytes != null && (
              <>
                <dt>Size</dt>
                <dd>{formatBytes(mod.sizeBytes)}</dd>
              </>
            )}
            {mod?.author && (
              <>
                <dt>Author</dt>
                <dd>{mod.author}</dd>
              </>
            )}
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
        {isHttpUrl(componentReadme) && (
          <>
            <dt>Component readme</dt>
            <dd>
              <a
                className="detail-url"
                href={componentReadme}
                target="_blank"
                rel="noopener noreferrer"
              >
                {componentReadme}
              </a>
            </dd>
          </>
        )}
      </dl>
      {hasRelations && (
        <div className="detail-relations">
          {RELATION_ROWS.map(({ key, label: rowLabel }) => {
            const refs = relations[key]
            if (refs.length === 0) return null
            return (
              <RelationSection
                key={key}
                label={rowLabel}
                refs={refs}
                onNavigate={onNavigateToComponent}
              />
            )
          })}
        </div>
      )}
    </article>
  )
}
