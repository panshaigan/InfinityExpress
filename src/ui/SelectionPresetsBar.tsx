import { useEffect, useId, useRef, useState } from 'react'

export interface SelectionPresetsBarProps {
  disabled: boolean
  presets: { id: string; name: string }[]
  activePresetId: string | null
  activePresetName: string | null
  dirty: boolean
  canSave: boolean
  canDelete: boolean
  onSelectPreset: (id: string | null) => void
  onSave: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

export function SelectionPresetsBar({
  disabled,
  presets,
  activePresetId,
  activePresetName,
  dirty,
  canSave,
  canDelete,
  onSelectPreset,
  onSave,
  onRename,
  onDelete,
}: SelectionPresetsBarProps) {
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState(activePresetName ?? '')
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    setDraftName(activePresetName ?? '')
  }, [activePresetId, activePresetName])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function commitRename() {
    if (!activePresetId || activePresetName == null) return
    const next = draftName.trim()
    if (!next || next === activePresetName) {
      setDraftName(activePresetName)
      return
    }
    onRename(next)
  }

  const triggerLabel = dirty
    ? 'User preset *'
    : activePresetName
      ? activePresetName
      : 'User presets'

  return (
    <div ref={rootRef} className="selection-presets-bar" aria-label="User presets">
      <button
        type="button"
        className={`btn secondary selection-presets-trigger${open ? ' open' : ''}${dirty ? ' dirty' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="selection-presets-trigger-label">{triggerLabel}</span>
        <span className="selection-presets-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="selection-presets-popover" id={panelId} role="group">
          <label className="selection-presets-field">
            <span className="selection-presets-field-label">Load</span>
            <select
              className="selection-presets-select"
              value={dirty ? '' : (activePresetId ?? '')}
              disabled={disabled}
              aria-label="Load selection preset"
              onChange={(e) => {
                const value = e.target.value
                onSelectPreset(value === '' ? null : value)
              }}
            >
              <option value="">
                {presets.length === 0 ? 'No presets yet' : 'Select preset…'}
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {activePresetId != null && activePresetName != null && !dirty ? (
            <label className="selection-presets-field">
              <span className="selection-presets-field-label">Rename</span>
              <input
                type="text"
                className="selection-presets-name"
                value={draftName}
                disabled={disabled}
                aria-label="Rename preset"
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setDraftName(activePresetName)
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
              />
            </label>
          ) : null}

          <div className="selection-presets-actions">
            <button
              type="button"
              className="btn"
              disabled={!canSave}
              onClick={() => {
                onSave()
              }}
              title={
                activePresetId
                  ? dirty
                    ? 'Update current preset'
                    : 'No changes to save'
                  : 'Save current selection as a new preset'
              }
            >
              {activePresetId && dirty ? 'Update' : 'Save'}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={!canDelete}
              onClick={() => {
                onDelete()
                setOpen(false)
              }}
              title="Delete current preset"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
