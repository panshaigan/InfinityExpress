import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isDesktopApp, saveTextFile } from '../lib/desktop/fsDialogs'
import {
  downloadText,
  normalizeExportFilename,
} from '../lib/export/installOrder'
import { useBackdropDismiss } from './backdropDismiss'
import { IconTip } from './IconTip'

export interface ExportPreviewTab {
  id: string
  label: string
}

interface Props {
  open: boolean
  onClose: () => void
  title: string
  meta: ReactNode
  text: string
  filename: string
  onFilenameChange: (next: string) => void
  fallbackFilename: string
  previewAriaLabel: string
  copyAriaLabel?: string
  saveAriaLabel?: string
  tabs?: ExportPreviewTab[]
  activeTabId?: string
  onTabChange?: (id: string) => void
  tablistAriaLabel?: string
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 5-5L12.6 5l-6.1 6.2Z"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h6a2 2 0 0 1 2 2v6h-1.5V4a.5.5 0 0 0-.5-.5H6V2Zm-3 3h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 1.5a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V7a.5.5 0 0 0-.5-.5H3Z"
      />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M3 1.5h8.2L14.5 4.8V13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2.5 13V3A1.5 1.5 0 0 1 4 1.5H3Zm1 1A.5.5 0 0 0 3.5 3v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V5.2L10.8 2.5H8.5V6H5V2.5H4Zm1.5 0V5h2V2.5h-2ZM5 9h6v3.5H5V9Z"
      />
    </svg>
  )
}

export function ExportPreviewDialog({
  open,
  onClose,
  title,
  meta,
  text,
  filename,
  onFilenameChange,
  fallbackFilename,
  previewAriaLabel,
  copyAriaLabel = 'Copy',
  saveAriaLabel = 'Save',
  tabs,
  activeTabId,
  onTabChange,
  tablistAriaLabel = 'Export tabs',
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)
  const [copied, setCopied] = useState(false)
  const hasTabs = tabs != null && tabs.length > 0

  useEffect(() => {
    if (!open) return
    setCopied(false)
    panelRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  async function onSave() {
    const name = normalizeExportFilename(filename, fallbackFilename)
    if (isDesktopApp()) {
      try {
        await saveTextFile(name, text)
      } catch {
        /* dialog/fs may fail; leave preview open */
      }
      return
    }
    downloadText(text, name)
  }

  if (!open) return null

  const activeTab = hasTabs
    ? tabs.find((t) => t.id === activeTabId) ?? tabs[0]
    : null

  return (
    <div
      className="export-dialog-backdrop"
      role="presentation"
      {...backdrop}
    >
      <div
        ref={panelRef}
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-dialog-header">
          <h2 id="export-dialog-title">{title}</h2>
        </div>

        {hasTabs ? (
          <div
            className="export-dialog-tabs"
            role="tablist"
            aria-label={tablistAriaLabel}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`export-tab-${tab.id}`}
                aria-selected={tab.id === activeTab?.id}
                aria-controls="export-dialog-preview"
                className={`export-dialog-tab${
                  tab.id === activeTab?.id ? ' active' : ''
                }`}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        <p className="export-dialog-meta">{meta}</p>

        <textarea
          id="export-dialog-preview"
          className="export-dialog-code ie-scroll"
          readOnly
          spellCheck={false}
          value={text}
          aria-label={previewAriaLabel}
          role={hasTabs ? 'tabpanel' : undefined}
          aria-labelledby={
            hasTabs && activeTab ? `export-tab-${activeTab.id}` : undefined
          }
        />

        <div className="export-dialog-actions">
          <label className="export-dialog-filename">
            <span className="export-dialog-filename-label">File name</span>
            <input
              type="text"
              value={filename}
              onChange={(e) => onFilenameChange(e.target.value)}
              spellCheck={false}
              aria-label="Save file name"
            />
          </label>
          <div className="export-dialog-icons">
            <button
              type="button"
              className="export-dialog-icon-btn has-icon-tip"
              onClick={() => void onCopy()}
              aria-label={copied ? 'Copied' : copyAriaLabel}
            >
              <CopyIcon copied={copied} />
              <IconTip align="end">{copied ? 'Copied' : 'Copy'}</IconTip>
            </button>
            <button
              type="button"
              className="export-dialog-icon-btn has-icon-tip"
              onClick={() => void onSave()}
              aria-label={saveAriaLabel}
            >
              <SaveIcon />
              <IconTip align="end">Save</IconTip>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
