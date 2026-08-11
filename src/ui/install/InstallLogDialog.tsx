import { useEffect, useRef, useState } from 'react'
import { isDesktopApp, saveTextFile } from '../../lib/desktop/fsDialogs'
import { downloadText } from '../../lib/export/installOrder'
import { useBackdropDismiss } from '../backdropDismiss'
import { IconTip } from '../IconTip'

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
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 1.5h8.2L14.5 4.8V13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2.5 13V3A1.5 1.5 0 0 1 4 1.5H3Zm1 1A.5.5 0 0 0 3.5 3v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V5.2L10.8 2.5H8.5V6H5V2.5H4Zm1.5 0V5h2V2.5h-2ZM5 9h6v3.5H5V9Z"
      />
    </svg>
  )
}

interface Props {
  open: boolean
  title: string
  contents: string | null
  loading?: boolean
  error?: string | null
  /** When set, show Save and use this default filename. */
  saveFilename?: string | null
  onClose: () => void
}

export function InstallLogDialog({
  open,
  title,
  contents,
  loading = false,
  error = null,
  saveFilename = null,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)
  const [copied, setCopied] = useState(false)

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
    if (!contents) return
    try {
      await navigator.clipboard.writeText(contents)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  async function onSave() {
    if (!contents || !saveFilename) return
    if (isDesktopApp()) {
      try {
        await saveTextFile(saveFilename, contents)
      } catch {
        /* dialog/fs may fail; leave preview open */
      }
      return
    }
    downloadText(contents, saveFilename)
  }

  if (!open) return null

  const displayText = loading
    ? 'Loading…'
    : error
      ? error
      : contents ?? '(empty)'

  const canAct = Boolean(contents) && !loading && !error

  return (
    <div className="keyboard-help-backdrop" role="presentation" {...backdrop}>
      <div
        ref={panelRef}
        className="keyboard-help export-dialog install-log-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-log-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="keyboard-help-header">
          <h2 id="install-log-dialog-title">{title}</h2>
        </div>

        <textarea
          className="export-dialog-code ie-scroll"
          readOnly
          spellCheck={false}
          value={displayText}
          aria-label="Install log contents"
        />

        <div className="export-dialog-actions">
          <div className="export-dialog-icons">
            <button
              type="button"
              className="export-dialog-icon-btn has-icon-tip"
              disabled={!canAct}
              onClick={() => void onCopy()}
              aria-label={copied ? 'Copied' : 'Copy log'}
            >
              <CopyIcon copied={copied} />
              <IconTip align="end">{copied ? 'Copied' : 'Copy'}</IconTip>
            </button>
            {saveFilename ? (
              <button
                type="button"
                className="export-dialog-icon-btn has-icon-tip"
                disabled={!canAct}
                onClick={() => void onSave()}
                aria-label="Save log"
              >
                <SaveIcon />
                <IconTip align="end">Save</IconTip>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
