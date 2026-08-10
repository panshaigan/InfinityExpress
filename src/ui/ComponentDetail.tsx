import { useState, type ReactNode } from 'react'
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
  resolveModLookupKey,
  resolveModStability,
  resolveModType,
  type ModInfo,
} from '../lib/mods/loadMods'
import { modTypeBadgeClass, modTypeBadgeLabel } from '../lib/mods/modTypeBadge'
import { statusBadgeClass } from '../lib/badges/statusBadge'
import { isHttpUrl } from '../lib/url'
import { JumpIcon } from './JumpIcon'

export type DetailSelectionState = 'checked' | 'unchecked' | 'indeterminate'

type DetailBlockKind = 'component' | 'mod' | 'relations'

interface Props {
  display: DisplayNode | null
  model: InstallSequenceModel
  relationIndex: RelationIndex
  modsByCodename: ReadonlyMap<string, ModInfo>
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
      className="detail-copy-name has-icon-tip"
      onClick={() => void onCopy()}
      aria-label={copied ? 'Copied' : label}
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
      <span className="icon-tip" role="tooltip">
        {copied ? 'Copied' : label}
      </span>
    </button>
  )
}

function DetailBlock({
  kind,
  title,
  children,
}: {
  kind: DetailBlockKind
  title: string
  children: ReactNode
}) {
  return (
    <section className={`detail-block detail-block-${kind}`}>
      <h4 className="detail-block-title">{title}</h4>
      <div className="detail-block-body">{children}</div>
    </section>
  )
}

function DetailLinks({ links }: { links: { href: string; label: string }[] }) {
  if (links.length === 0) return null
  return (
    <ul className="detail-links">
      {links.map((link) => (
        <li key={link.href + link.label}>
          <a
            className="detail-url has-icon-tip"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.label}
            <span className="icon-tip" role="tooltip">
              {link.href}
            </span>
          </a>
        </li>
      ))}
    </ul>
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
            <span className="detail-relation-label">{ref.label}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

const RELATION_ROWS: {
  key: keyof ReturnType<typeof resolveRelations>
  label: string
}[] = [
  { key: 'autoIncludedWhen', label: 'Included when' },
  { key: 'autoIncludes', label: 'Includes' },
  { key: 'shownWhen', label: 'Shown when' },
  { key: 'unlocks', label: 'Unlocks' },
  { key: 'hiddenWhen', label: 'Hidden when' },
  { key: 'hides', label: 'Hides' },
]

export function ComponentDetail({
  display,
  model,
  relationIndex,
  modsByCodename,
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
  const relationRows = RELATION_ROWS.map((row) => ({
    ...row,
    refs: relations[row.key],
  })).filter((row) => row.refs.length > 0)

  const componentLinks: { href: string; label: string }[] = []
  if (isHttpUrl(componentReadme)) {
    componentLinks.push({ href: componentReadme, label: 'Readme' })
  }

  const modHasReadme = isHttpUrl(modReadme)
  const modLinks: { href: string; label: string }[] = []
  if (mod?.url) {
    modLinks.push({
      href: mod.url,
      label: modHasReadme ? 'Page' : 'Page/Readme',
    })
  }
  if (modHasReadme) modLinks.push({ href: modReadme, label: 'Readme' })

  const hasModSection = Boolean(codename)
  const hasComponentMeta = Boolean(componentId || attrs.name)

  const aboutSummary =
    kind === 'Component'
      ? null
      : kind === 'Alternatives'
        ? `${componentCount} option${componentCount === 1 ? '' : 's'}`
        : `Group · ${componentCount} component${componentCount === 1 ? '' : 's'}`

  return (
    <article className="component-detail">
      <div className="detail-sticky">
        <div className="detail-title-row">
          <h3 className="detail-title">{title}</h3>
          {componentId && onNavigateToComponent && (
            <button
              type="button"
              className="detail-jump has-icon-tip"
              aria-label={`Jump to ${title} in its station`}
              onClick={() => onNavigateToComponent(componentId)}
            >
              <JumpIcon />
              <span className="icon-tip" role="tooltip">
                Jump to station
              </span>
            </button>
          )}
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
        {desc ? (
          <p className="detail-desc">{desc}</p>
        ) : aboutSummary ? (
          <p className="detail-empty">{aboutSummary}</p>
        ) : null}
      </div>

      <div className="detail-blocks">
        {(hasComponentMeta || tagList.length > 0 || componentLinks.length > 0) && (
          <DetailBlock kind="component" title="Component">
            {hasComponentMeta && (
              <dl className="outlined-fields">
                {componentId && (
                  <div className="outlined-field">
                    <dt>Id</dt>
                    <dd className="detail-name-value">
                      <span>{componentId}</span>
                      <CopyButton value={componentId} label="Copy id" />
                    </dd>
                  </div>
                )}
                {attrs.name && (
                  <div className="outlined-field">
                    <dt>WeiDU Label</dt>
                    <dd className="detail-name-value">
                      <span>{attrs.name}</span>
                      <CopyButton value={attrs.name} label="Copy WeiDU label" />
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {tagList.length > 0 && (
              <ul className="detail-tags">
                {tagList.map((tag) => (
                  <li key={tag} className="detail-tag">
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            <DetailLinks links={componentLinks} />
          </DetailBlock>
        )}

        {hasModSection && (
          <DetailBlock kind="mod" title="Mod">
            <dl className="outlined-fields">
              {hasModField(mod?.name) && (
                <div className="outlined-field">
                  <dt>Name</dt>
                  <dd>
                    {mod.name}
                    {hasModField(mod.abbreviation) &&
                    mod.abbreviation !== mod.name
                      ? ` (${mod.abbreviation})`
                      : ''}
                  </dd>
                </div>
              )}
              {codename && (
                <div className="outlined-field">
                  <dt>Download ID</dt>
                  <dd>{codename}</dd>
                </div>
              )}
              {hasModField(mod?.category) && (
                <div className="outlined-field">
                  <dt>Category</dt>
                  <dd>{mod.category}</dd>
                </div>
              )}
              {mod?.release && (
                <div className="outlined-field">
                  <dt>Release</dt>
                  <dd>{mod.release}</dd>
                </div>
              )}
              {mod?.version && (
                <div className="outlined-field">
                  <dt>Version</dt>
                  <dd>{mod.version}</dd>
                </div>
              )}
              {mod?.sizeBytes != null && (
                <div className="outlined-field">
                  <dt>Size</dt>
                  <dd>{formatBytes(mod.sizeBytes)}</dd>
                </div>
              )}
              {mod?.author && (
                <div className="outlined-field">
                  <dt>Author</dt>
                  <dd>{mod.author}</dd>
                </div>
              )}
            </dl>
            <DetailLinks links={modLinks} />
          </DetailBlock>
        )}

        {relationRows.length > 0 && (
          <DetailBlock kind="relations" title="Relations">
            <div className="detail-relations">
              {relationRows.map((row) => (
                <div key={row.key} className="detail-relation-section">
                  <p className="detail-relation-heading">{row.label}</p>
                  <RelationList
                    refs={row.refs}
                    onNavigate={onNavigateToComponent}
                  />
                </div>
              ))}
            </div>
          </DetailBlock>
        )}
      </div>
    </article>
  )
}
