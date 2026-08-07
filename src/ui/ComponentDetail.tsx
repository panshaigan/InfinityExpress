import { useState, type ReactNode } from 'react'
import modsCsv from '../data/mods.csv?raw'
import {
  isComponentNode,
  type ComponentNode,
  type InstallSequenceModel,
  type TreeNode,
} from '../lib/xml/schema'
import type { DisplayNode } from '../lib/selection/visibility'
import {
  resolveRelations,
  type RelatedRef,
  type RelationIndex,
} from '../lib/selection/relations'
import { levelBadgeClass, levelBadgeLabel } from '../lib/levels'
import {
  splitTags,
  stabilityBadgeClass,
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
import { statusBadgeClass } from '../lib/badges/statusBadge'
import { isHttpUrl } from '../lib/url'

const modsByCodename = parseModsCsv(modsCsv)

export type DetailSelectionState = 'checked' | 'unchecked' | 'indeterminate'

interface Props {
  display: DisplayNode | null
  model: InstallSequenceModel
  relationIndex: RelationIndex
  selectionState?: DetailSelectionState | null
  onNavigateToComponent?: (componentId: string) => void
}

function resolveDetailTitle(node: TreeNode, collapsed?: ComponentNode): string {
  return node.attrs.label ?? collapsed?.attrs.label ?? node.tag
}

function resolveDetailKind(display: DisplayNode): 'Component' | 'Group' | 'Alternatives' {
  if (display.collapsedComponent || isComponentNode(display.node)) return 'Component'
  if (display.node.kind === 'alternatives') return 'Alternatives'
  return 'Group'
}

function countDisplayComponents(display: DisplayNode): number {
  if (display.collapsedComponent || isComponentNode(display.node)) return 1
  let total = 0
  for (const child of display.children) total += countDisplayComponents(child)
  return total
}

function selectionLabel(state: DetailSelectionState): string {
  if (state === 'checked') return 'Checked'
  if (state === 'indeterminate') return 'Partial'
  return 'Unchecked'
}

function CopyButton({ value, label }: { value: string; label: string }) {
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
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
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

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="detail-section">
      <h4 className="detail-section-label">{title}</h4>
      <div className="detail-section-body">{children}</div>
    </section>
  )
}

function RelationList({
  refs,
  onNavigate,
}: {
  refs: RelatedRef[]
  onNavigate?: (componentId: string) => void
}) {
  return (
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
  )
}

const RELATION_GROUPS: {
  title: string
  rows: { key: keyof ReturnType<typeof resolveRelations>; label: string }[]
}[] = [
  {
    title: 'Auto-include',
    rows: [
      { key: 'autoIncludedWhen', label: 'Included when' },
      { key: 'autoIncludes', label: 'Includes' },
    ],
  },
  {
    title: 'Visibility',
    rows: [
      { key: 'shownWhen', label: 'Shown when' },
      { key: 'unlocks', label: 'Unlocks' },
    ],
  },
  {
    title: 'Hide',
    rows: [
      { key: 'hiddenWhen', label: 'Hidden when' },
      { key: 'hides', label: 'Hides' },
    ],
  },
]

export function ComponentDetail({
  display,
  model,
  relationIndex,
  selectionState = null,
  onNavigateToComponent,
}: Props) {
  if (!display) {
    return (
      <div className="detail-empty-state">
        <p className="detail-empty-title">Nothing focused</p>
        <p className="detail-empty">
          Click a row for notes, links, and relations. Double-click or press Space to
          check it.
        </p>
      </div>
    )
  }

  const { node, collapsedComponent } = display
  const source = collapsedComponent ?? node
  const title = resolveDetailTitle(node, collapsedComponent)
  const kind = resolveDetailKind(display)
  const desc = node.attrs.desc ?? collapsedComponent?.attrs.desc
  const level = collapsedComponent?.effectiveLevel ?? node.effectiveLevel
  const tagList = splitTags(source.attrs.tags ?? node.attrs.tags)
  const componentId = collapsedComponent
    ? collapsedComponent.componentId
    : isComponentNode(node)
      ? node.componentId
      : undefined
  const attrs = source.attrs
  const componentCount = countDisplayComponents(display)

  const codename = resolveModLookupKey(model, source)
  const stability = resolveModStability(model, modsByCodename, source)
  const stabilityLabel = stabilityBadgeLabel(stability)
  const stabilityClass = stabilityBadgeClass(stability)
  const mod = codename ? modsByCodename.get(codename) : undefined
  const modType = resolveModType(model, modsByCodename, source, {
    asBranch: isModTypeBranchDisplay(model, node, {
      collapsedToSingleComponent: Boolean(collapsedComponent),
    }),
  })
  const componentReadme = attrs.readme
  const modReadme = mod?.readme

  const relations = resolveRelations(model, relationIndex, attrs, componentId)
  const relationGroups = RELATION_GROUPS.map((group) => ({
    ...group,
    rows: group.rows
      .map((row) => ({ ...row, refs: relations[row.key] }))
      .filter((row) => row.refs.length > 0),
  })).filter((group) => group.rows.length > 0)

  const links: { href: string; label: string }[] = []
  if (mod?.url) links.push({ href: mod.url, label: 'Page' })
  if (isHttpUrl(modReadme)) links.push({ href: modReadme, label: 'Mod readme' })
  if (isHttpUrl(componentReadme)) {
    links.push({ href: componentReadme, label: 'Component readme' })
  }

  const hasModSection = Boolean(codename)

  const hasComponentSection = Boolean(componentId || attrs.name)

  const aboutSummary =
    kind === 'Component'
      ? null
      : kind === 'Alternatives'
        ? `Alternatives · ${componentCount} option${componentCount === 1 ? '' : 's'}`
        : `Group · ${componentCount} component${componentCount === 1 ? '' : 's'}`

  return (
    <article className="component-detail">
      <div className="detail-sticky">
        <div className="detail-title-row">
          <h3 className="detail-title">{title}</h3>
        </div>
        <div className="detail-badges">
          {selectionState && (
            <span
              className={`badge badge-selection badge-selection-${selectionState}`}
            >
              {selectionLabel(selectionState)}
            </span>
          )}
          {level && (
            <span className={levelBadgeClass(level)}>{levelBadgeLabel(level)}</span>
          )}
          {modType && (
            <span className={modTypeBadgeClass(modType)}>{modTypeBadgeLabel(modType)}</span>
          )}
          {stabilityLabel && stabilityClass && (
            <span className={stabilityClass}>{stabilityLabel}</span>
          )}
          {attrs.required && (
            <span className={statusBadgeClass('required')}>required</span>
          )}
          {attrs.noDisplay && (
            <span className={statusBadgeClass('hidden')}>hidden</span>
          )}
          {!collapsedComponent && attrs.core && (
            <span className={statusBadgeClass('core')}>core</span>
          )}
          {!collapsedComponent && attrs.default && (
            <span className={statusBadgeClass('default')}>default</span>
          )}
        </div>
      </div>

      <DetailSection title="About">
        {desc ? (
          <p className="detail-desc">{desc}</p>
        ) : aboutSummary ? (
          <p className="detail-empty">{aboutSummary}</p>
        ) : (
          <p className="detail-empty">No description.</p>
        )}
      </DetailSection>

      {links.length > 0 && (
        <DetailSection title="Links">
          <ul className="detail-links">
            {links.map((link) => (
              <li key={link.href + link.label}>
                <a
                  className="detail-url"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {hasModSection && (
        <DetailSection title="Mod">
          <dl className="detail-meta">
            {hasModField(mod?.name) && (
              <>
                <dt>Name</dt>
                <dd>
                  {mod.name}
                  {hasModField(mod.abbreviation) &&
                  mod.abbreviation !== mod.name
                    ? ` (${mod.abbreviation})`
                    : ''}
                </dd>
              </>
            )}
            {codename && (
              <>
                <dt>Download id</dt>
                <dd>
                  <code>{codename}</code>
                </dd>
              </>
            )}
            {hasModField(mod?.category) && (
              <>
                <dt>Category</dt>
                <dd>{mod.category}</dd>
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
          </dl>
        </DetailSection>
      )}

      {hasComponentSection && (
        <DetailSection title="Component">
          <dl className="detail-meta">
            {componentId && (
              <>
                <dt>Id</dt>
                <dd className="detail-name-value">
                  <code>{componentId}</code>
                  <CopyButton value={componentId} label="Copy id" />
                </dd>
              </>
            )}
            {attrs.name && (
              <>
                <dt>Name</dt>
                <dd className="detail-name-value">
                  <span>{attrs.name}</span>
                  <CopyButton value={attrs.name} label="Copy name" />
                </dd>
              </>
            )}
          </dl>
        </DetailSection>
      )}

      {tagList.length > 0 && (
        <DetailSection title="Tags">
          <ul className="detail-tags">
            {tagList.map((tag) => (
              <li key={tag} className="detail-tag">
                {tag}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {relationGroups.length > 0 && (
        <DetailSection title="Relations">
          <div className="detail-relations">
            {relationGroups.map((group) => (
              <div key={group.title} className="detail-relation-group">
                <h5 className="detail-relation-group-title">{group.title}</h5>
                {group.rows.map((row) => (
                  <div key={row.key} className="detail-relation-section">
                    <p className="detail-relation-heading">{row.label}</p>
                    <RelationList
                      refs={row.refs}
                      onNavigate={onNavigateToComponent}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DetailSection>
      )}
    </article>
  )
}
