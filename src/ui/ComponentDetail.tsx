import { useMemo, useState } from 'react'
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
  hasModField,
  isModTypeBranchDisplay,
  parseModsCsv,
  resolveModLookupKey,
  resolveModStability,
  resolveModType,
} from '../lib/mods/loadMods'
import { modTypeBadgeClass, modTypeBadgeLabel } from '../lib/mods/modTypeBadge'
import { isHttpUrl } from '../lib/url'

const modsByCodename = parseModsCsv(modsCsv)

interface Props {
  display: DisplayNode | null
  model: InstallSequenceModel
  onNavigateToComponent?: (componentId: string) => void
}

type TitleSource = 'label' | 'tag'

function resolveDetailTitle(
  node: TreeNode,
  collapsed?: ComponentNode,
): { text: string; source: TitleSource } {
  const label = node.attrs.label ?? collapsed?.attrs.label
  if (label) return { text: label, source: 'label' }
  return { text: node.tag, source: 'tag' }
}

function CopyNameButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <button
      type="button"
      className="detail-copy-name"
      onClick={() => void onCopy()}
      aria-label={copied ? 'Copied' : 'Copy name'}
      title={copied ? 'Copied' : 'Copy name'}
    >
      {copied ? (
        <svg
          className="detail-copy-name-icon"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 4.6-4.6L12.2 5.5z"
          />
        </svg>
      ) : (
        <svg
          className="detail-copy-name-icon"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M5.5 2A1.5 1.5 0 0 0 4 3.5v7A1.5 1.5 0 0 0 5.5 12h5A1.5 1.5 0 0 0 12 10.5v-7A1.5 1.5 0 0 0 10.5 2zm0 1h5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5zM2.5 5v7.5A1.5 1.5 0 0 0 4 14h6.5v-1H4a.5.5 0 0 1-.5-.5V5z"
          />
        </svg>
      )}
    </button>
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
  const title = resolveDetailTitle(node, collapsedComponent)
  const desc = node.attrs.desc ?? collapsedComponent?.attrs.desc
  const level = collapsedComponent?.effectiveLevel ?? node.effectiveLevel
  const tagList = splitTags(source.attrs.tags ?? node.attrs.tags)
  const componentId = collapsedComponent
    ? collapsedComponent.componentId
    : isComponentNode(node)
      ? node.componentId
      : undefined
  const attrs = source.attrs

  const codename = resolveModLookupKey(model, source)
  const stabilityLabel = stabilityBadgeLabel(
    resolveModStability(model, modsByCodename, source),
  )
  const mod = codename ? modsByCodename.get(codename) : undefined
  const modType = resolveModType(model, modsByCodename, source, {
    asBranch: isModTypeBranchDisplay(model, node, {
      collapsedToSingleComponent: Boolean(collapsedComponent),
    }),
  })
  const componentReadme = attrs.readme
  const modReadme = mod?.readme

  const relations = resolveRelations(model, relationIndex, attrs, componentId)
  const hasRelations = RELATION_ROWS.some((row) => relations[row.key].length > 0)

  return (
    <article className="component-detail">
      <div className="detail-title-row">
        <h3 className="detail-title">{title.text}</h3>
      </div>
      <div className="detail-badges">
        {level && (
          <span className={levelBadgeClass(level)}>{levelBadgeLabel(level)}</span>
        )}
        {modType && (
          <span className={modTypeBadgeClass(modType)}>{modTypeBadgeLabel(modType)}</span>
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
            {hasModField(mod?.name) && (
              <>
                <dt>Mod</dt>
                <dd>
                  {mod.name}
                  {hasModField(mod.abbreviation) &&
                  mod.abbreviation !== mod.name
                    ? ` (${mod.abbreviation})`
                    : ''}
                </dd>
              </>
            )}
            <dt>Download Id</dt>
            <dd>{codename}</dd>
            {hasModField(mod?.category) && (
              <>
                <dt>Category</dt>
                <dd>{mod.category}</dd>
              </>
            )}
            {modType && (
              <>
                <dt>Type</dt>
                <dd>{modType}</dd>
              </>
            )}
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
        {attrs.name && (
          <>
            <dt>Name</dt>
            <dd className="detail-name-value">
              <span>{attrs.name}</span>
              <CopyNameButton value={attrs.name} />
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
