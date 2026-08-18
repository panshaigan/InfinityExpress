import { useEffect, useId, useRef, useState } from 'react'
import { IconTip } from './IconTip'
import { OutlinedSelect } from './OutlinedSelect'
import { OutlinedTextField } from './OutlinedTextField'

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
  const [loadSelectOpen, setLoadSelectOpen] = useState(false)
  const [draftName, setDraftName] = useState(activePresetName ?? '')
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    setDraftName(activePresetName ?? '')
  }, [activePresetId, activePresetName])

  useEffect(() => {
    if (!open) {
      setLoadSelectOpen(false)
      return
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node & Element
      if (rootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.outlined-select-popover')) {
        return
      }
      setOpen(false)
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
      : 'Presets'

  const emptyLoadLabel =
    presets.length === 0 ? 'No presets yet' : 'Select preset…'

  return (
    <div ref={rootRef} className="selection-presets-bar" aria-label="Presets">
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
          <div className="selection-presets-field">
            <OutlinedSelect
              className="outlined-field-wide"
              label="Load"
              value={dirty ? '' : (activePresetId ?? '')}
              emptyLabel={emptyLoadLabel}
              disabled={disabled}
              open={loadSelectOpen}
              onOpenChange={setLoadSelectOpen}
              onChange={(value) => {
                onSelectPreset(value === '' ? null : value)
              }}
              options={[
                { value: '', label: emptyLoadLabel },
                ...presets.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>

          {activePresetId != null && activePresetName != null && !dirty ? (
            <div className="selection-presets-field">
              <OutlinedTextField
                label="Rename"
                value={draftName}
                disabled={disabled}
                onChange={setDraftName}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setDraftName(activePresetName)
                    e.currentTarget.blur()
                  }
                }}
              />
            </div>
          ) : null}

          <div className="selection-presets-actions">
            <span className="has-icon-tip">
              <button
                type="button"
                className="btn"
                disabled={!canSave}
                onClick={() => {
                  onSave()
                }}
              >
                {activePresetId && dirty ? 'Update' : 'Save'}
              </button>
              <IconTip>
                {activePresetId
                  ? dirty
                    ? 'Update current preset'
                    : 'No changes to save'
                  : 'Save current selection as a new preset'}
              </IconTip>
            </span>
            <span className="has-icon-tip">
              <button
                type="button"
                className="btn secondary"
                disabled={!canDelete}
                onClick={() => {
                  onDelete()
                  setOpen(false)
                }}
              >
                Delete
              </button>
              <IconTip>Delete current preset</IconTip>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
