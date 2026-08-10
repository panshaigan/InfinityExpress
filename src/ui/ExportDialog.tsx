import { useEffect, useMemo, useRef, useState } from 'react'
import { isDesktopApp, saveTextFile } from '../lib/desktop/fsDialogs'
import {
  buildInstallOrderText,
  countInstallOrderMods,
  downloadText,
  normalizeExportFilename,
  type ExportPhase,
} from '../lib/export/installOrder'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import { useBackdropDismiss } from './backdropDismiss'
import { IconTip } from './IconTip'

type EetTab = 'eet1' | 'eet'

interface Props {
  open: boolean
  onClose: () => void
  model: InstallSequenceModel
  selectedIds: ReadonlySet<string>
  game: SelectedGame | null
}

const DEFAULT_FILENAME = 'install-order.txt'
const DEFAULT_PRE_EET_FILENAME = 'install-order-pre-eet.txt'
const DEFAULT_EET_FILENAME = 'install-order-eet.txt'

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

export function ExportDialog({ open, onClose, model, selectedIds, game }: Props) {
  const isEet = game === 'eet'
  const panelRef = useRef<HTMLDivElement>(null)
  const backdrop = useBackdropDismiss(onClose)
  const [tab, setTab] = useState<EetTab>('eet1')
  const [filenameAll, setFilenameAll] = useState(DEFAULT_FILENAME)
  const [filenamePreEet, setFilenamePreEet] = useState(DEFAULT_PRE_EET_FILENAME)
  const [filenameEet, setFilenameEet] = useState(DEFAULT_EET_FILENAME)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('eet1')
    setFilenameAll(DEFAULT_FILENAME)
    setFilenamePreEet(DEFAULT_PRE_EET_FILENAME)
    setFilenameEet(DEFAULT_EET_FILENAME)
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

  const phase: ExportPhase = isEet ? tab : 'all'

  const text = useMemo(
    () => buildInstallOrderText(model, selectedIds, phase),
    [model, selectedIds, phase],
  )

  const lineCount = useMemo(
    () => (text ? text.trimEnd().split('\n').length : 0),
    [text],
  )

  const modCount = useMemo(
    () => countInstallOrderMods(model, selectedIds, phase),
    [model, selectedIds, phase],
  )

  const filename =
    !isEet ? filenameAll : tab === 'eet1' ? filenamePreEet : filenameEet

  function setFilename(next: string) {
    if (!isEet) setFilenameAll(next)
    else if (tab === 'eet1') setFilenamePreEet(next)
    else setFilenameEet(next)
  }

  const fallbackName =
    !isEet
      ? DEFAULT_FILENAME
      : tab === 'eet1'
        ? DEFAULT_PRE_EET_FILENAME
        : DEFAULT_EET_FILENAME

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
    const name = normalizeExportFilename(filename, fallbackName)
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
          <h2 id="export-dialog-title">Export install order</h2>
        </div>

        {isEet ? (
          <div className="export-dialog-tabs" role="tablist" aria-label="EET install phases">
            <button
              type="button"
              role="tab"
              id="export-tab-eet1"
              aria-selected={tab === 'eet1'}
              aria-controls="export-dialog-preview"
              className={`export-dialog-tab${tab === 'eet1' ? ' active' : ''}`}
              onClick={() => setTab('eet1')}
            >
              Pre-EET (install on BG1)
            </button>
            <button
              type="button"
              role="tab"
              id="export-tab-eet"
              aria-selected={tab === 'eet'}
              aria-controls="export-dialog-preview"
              className={`export-dialog-tab${tab === 'eet' ? ' active' : ''}`}
              onClick={() => setTab('eet')}
            >
              EET
            </button>
          </div>
        ) : null}

        <p className="export-dialog-meta">
          {lineCount === 0
            ? 'No components in this list.'
            : `${modCount} mod${modCount === 1 ? '' : 's'} · ${lineCount} component${lineCount === 1 ? '' : 's'}`}
        </p>

        <textarea
          id="export-dialog-preview"
          className="export-dialog-code ie-scroll"
          readOnly
          spellCheck={false}
          value={text}
          aria-label="Install order preview"
          role={isEet ? 'tabpanel' : undefined}
          aria-labelledby={
            isEet ? (tab === 'eet1' ? 'export-tab-eet1' : 'export-tab-eet') : undefined
          }
        />

        <div className="export-dialog-actions">
          <label className="export-dialog-filename">
            <span className="export-dialog-filename-label">File name</span>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              spellCheck={false}
              aria-label="Save file name"
            />
          </label>
          <div className="export-dialog-icons">
            <button
              type="button"
              className="export-dialog-icon-btn has-icon-tip"
              onClick={() => void onCopy()}
              aria-label={copied ? 'Copied' : 'Copy install order'}
            >
              <CopyIcon copied={copied} />
              <IconTip align="end">{copied ? 'Copied' : 'Copy'}</IconTip>
            </button>
            <button
              type="button"
              className="export-dialog-icon-btn has-icon-tip"
              onClick={() => void onSave()}
              aria-label="Save install order"
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
