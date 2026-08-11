import type { ReactNode } from 'react'
import { effectiveModFields, type WorkingMod } from '../../lib/mods/loadMods'
import {
  formatGameDisplay,
  withHtmlPreviewIfNeeded,
} from '../../lib/mods/modFieldParse'
import {
  diskStatusLabel,
  formatModSize,
} from '../../lib/mods/modsTable'
import { isHttpUrl } from '../../lib/url'
import { DetailResizeHandle } from '../DetailResizeHandle'
import { IconTip } from '../IconTip'
import {
  CheckUpdatesIcon,
  DeleteFromCatalogIcon,
  DownloadIcon,
  EditModIcon,
  RemoveFromDiskIcon,
} from './ModsActionIcons'

interface Props {
  mod: WorkingMod | null
  collapsed: boolean
  width: number
  onWidthChange: (width: number) => void
  onToggleCollapsed: () => void
  onEdit: () => void
  onDeleteFromCatalog: () => void
  editDisabled?: boolean
  catalogDeleteDisabled?: boolean
  acquireLabel: string
  acquireDisabled: boolean
  jobRunning?: boolean
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
  editDisabled = false,
  catalogDeleteDisabled = false,
  acquireLabel,
  acquireDisabled,
  jobRunning = false,
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
            className="detail-pane-expand has-icon-tip"
            onClick={onToggleCollapsed}
            disabled={!mod}
            aria-expanded={false}
            aria-label={mod ? 'Show details' : 'Select a mod to show details'}
          >
            <span className="detail-pane-expand-label">Details</span>
            <IconTip>
              {mod ? 'Show details (;)' : 'Select a mod to show details'}
            </IconTip>
          </button>
        ) : (
          <>
            <div className="detail-pane-chrome">
              <span className="detail-pane-chrome-label">Details</span>
              {mod ? (
                <div className="mod-detail-actions mod-detail-actions-chrome">
                  <span className="mods-action-icon-wrap has-icon-tip">
                    <button
                      type="button"
                      className="mods-action-icon-btn"
                      disabled={editDisabled}
                      onClick={onEdit}
                      aria-label="Edit"
                    >
                      <EditModIcon />
                    </button>
                    <IconTip>Edit</IconTip>
                  </span>
                  <span className="mods-action-icon-wrap has-icon-tip">
                    <button
                      type="button"
                      className="mods-action-icon-btn"
                      onClick={onRemoveFromDisk}
                      disabled={mod.diskStatus === 'not_present'}
                      aria-label="Remove from disk"
                    >
                      <RemoveFromDiskIcon />
                    </button>
                    <IconTip>Remove from disk</IconTip>
                  </span>
                  <span className="mods-action-icon-wrap has-icon-tip">
                    <button
                      type="button"
                      className="mods-action-icon-btn"
                      disabled={catalogDeleteDisabled}
                      onClick={onDeleteFromCatalog}
                      aria-label="Remove from catalog"
                    >
                      <DeleteFromCatalogIcon />
                    </button>
                    <IconTip>Remove from catalog</IconTip>
                  </span>
                  <span className="mods-action-icon-wrap has-icon-tip">
                    <button
                      type="button"
                      className="mods-action-icon-btn"
                      disabled={
                        jobRunning || mod.diskStatus === 'not_present'
                      }
                      onClick={onCheckUpdates}
                      aria-label="Check for updates"
                    >
                      <CheckUpdatesIcon />
                    </button>
                    <IconTip>Check for updates</IconTip>
                  </span>
                  <span className="mods-action-icon-wrap has-icon-tip">
                    <button
                      type="button"
                      className="mods-action-icon-btn"
                      disabled={acquireDisabled || jobRunning}
                      onClick={onAcquire}
                      aria-label={acquireLabel}
                    >
                      <DownloadIcon />
                    </button>
                    <IconTip>{acquireLabel}</IconTip>
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                className="detail-pane-collapse has-icon-tip"
                onClick={onToggleCollapsed}
                aria-expanded={true}
                aria-label="Hide details"
              >
                »
                <IconTip>Hide details (;)</IconTip>
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
                <ModDetailBody mod={mod} />
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function ModDetailBody({ mod }: { mod: WorkingMod }) {
  const eff = effectiveModFields(mod)
  const title = eff.name || eff.codename

  return (
    <div className="mod-detail">
      <header className="mod-detail-header">
        <h2>{title}</h2>
        <div className="mod-detail-badges">
          <span className={`mods-origin-badge origin-${mod.origin}`}>
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
        <Field label="Game">
          {eff.game ? formatGameDisplay(eff.game) : '—'}
        </Field>
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
    </div>
  )
}
