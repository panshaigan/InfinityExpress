import type { ReactNode } from 'react'
import { effectiveModFields, type WorkingMod } from '../../lib/mods/loadMods'
import { withHtmlPreviewIfNeeded } from '../../lib/mods/modFieldParse'
import {
  diskStatusLabel,
  formatModSize,
} from '../../lib/mods/modsTable'
import { isHttpUrl } from '../../lib/url'
import { DetailResizeHandle } from '../DetailResizeHandle'

interface Props {
  mod: WorkingMod | null
  collapsed: boolean
  width: number
  onWidthChange: (width: number) => void
  onToggleCollapsed: () => void
  onEdit: () => void
  onDeleteFromCatalog: () => void
  acquireLabel: string
  acquireDisabled: boolean
  onAcquire: () => void
  onCheckUpdates: () => void
  onRemoveFromDisk: () => void
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  if (children == null || children === '') return null
  return (
    <div className="outlined-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function LinkValue({
  href,
  label,
  htmlPreview,
}: {
  href: string
  label?: string
  htmlPreview?: boolean
}) {
  const resolved = htmlPreview && href ? withHtmlPreviewIfNeeded(href) : href
  if (!isHttpUrl(resolved)) return <span>{resolved || '—'}</span>
  return (
    <a href={resolved} target="_blank" rel="noreferrer">
      {label ?? resolved}
    </a>
  )
}

export function ModDetail({
  mod,
  collapsed,
  width,
  onWidthChange,
  onToggleCollapsed,
  onEdit,
  onDeleteFromCatalog,
  acquireLabel,
  acquireDisabled,
  onAcquire,
  onCheckUpdates,
  onRemoveFromDisk,
}: Props) {
  return (
    <>
      {!collapsed && (
        <DetailResizeHandle width={width} onWidthChange={onWidthChange} />
      )}
      <aside
        className={`detail-pane mod-detail-pane${collapsed ? ' collapsed' : ''}`}
        aria-label="Mod details"
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
              {!mod ? (
                <div className="empty-panel">
                  <p className="empty-panel-title">No mod selected</p>
                  <p className="empty-panel-body">
                    Select a row to inspect catalog metadata and disk status.
                  </p>
                </div>
              ) : (
                <ModDetailBody
                  mod={mod}
                  onEdit={onEdit}
                  onDeleteFromCatalog={onDeleteFromCatalog}
                  acquireLabel={acquireLabel}
                  acquireDisabled={acquireDisabled}
                  onAcquire={onAcquire}
                  onCheckUpdates={onCheckUpdates}
                  onRemoveFromDisk={onRemoveFromDisk}
                />
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function ModDetailBody({
  mod,
  onEdit,
  onDeleteFromCatalog,
  acquireLabel,
  acquireDisabled,
  onAcquire,
  onCheckUpdates,
  onRemoveFromDisk,
}: {
  mod: WorkingMod
  onEdit: () => void
  onDeleteFromCatalog: () => void
  acquireLabel: string
  acquireDisabled: boolean
  onAcquire: () => void
  onCheckUpdates: () => void
  onRemoveFromDisk: () => void
}) {
  const eff = effectiveModFields(mod)
  const title = eff.name || eff.codename

  return (
    <div className="mod-detail">
      <header className="mod-detail-header">
        <h2>{title}</h2>
        <div className="mod-detail-badges">
          <span
            className={`mods-origin-badge origin-${mod.origin}`}
          >
            {mod.origin === 'user' ? 'Added by you' : 'Base catalog'}
          </span>
          <span className={`mods-status mods-status-${mod.diskStatus}`}>
            {diskStatusLabel(mod.diskStatus)}
          </span>
        </div>
      </header>

      <dl className="outlined-fields mod-detail-dl">
        <Field label="Download ID">{eff.codename}</Field>
        {eff.abbreviation ? (
          <Field label="Abbreviation">{eff.abbreviation}</Field>
        ) : null}
        <Field label="Category">{eff.category || '—'}</Field>
        <Field label="Game">{eff.game || '—'}</Field>
        <Field label="Type">{eff.type || '—'}</Field>
        <Field label="Stability">{eff.stability || '—'}</Field>
        <Field label="Author">{eff.author || '—'}</Field>
        <Field label="Version">{eff.version || '—'}</Field>
        <Field label="Latest update">{eff.release || '—'}</Field>
        <Field label="Size">{formatModSize(eff.sizeBytes)}</Field>
        <Field label="URL">
          <LinkValue href={eff.url} />
        </Field>
        <Field label="Readme">
          <LinkValue href={eff.readme} htmlPreview />
        </Field>
      </dl>

      <div className="mod-detail-actions">
        <button
          type="button"
          className="btn secondary"
          disabled={acquireDisabled}
          onClick={onAcquire}
        >
          {acquireLabel}
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={onCheckUpdates}
        >
          Check for updates
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={onRemoveFromDisk}
          disabled={mod.diskStatus === 'not_present'}
        >
          Remove from disk
        </button>
        {mod.origin === 'user' ? (
          <>
            <button type="button" className="btn" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={onDeleteFromCatalog}
            >
              Delete from catalog
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
