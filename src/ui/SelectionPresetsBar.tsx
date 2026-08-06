import { useEffect, useState } from 'react'

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
  const [draftName, setDraftName] = useState(activePresetName ?? '')

  useEffect(() => {
    setDraftName(activePresetName ?? '')
  }, [activePresetId, activePresetName])

  function commitRename() {
    if (!activePresetId || activePresetName == null) return
    const next = draftName.trim()
    if (!next || next === activePresetName) {
      setDraftName(activePresetName)
      return
    }
    onRename(next)
  }

  return (
    <div className="selection-presets-bar" aria-label="Selection presets">
      <label className="selection-presets-label">
        <span className="selection-presets-label-text">
          Preset{dirty ? ' *' : ''}
        </span>
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
        <input
          type="text"
          className="selection-presets-name"
          value={draftName}
          disabled={disabled}
          aria-label="Rename preset"
          title="Rename preset"
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
      ) : null}

      <button
        type="button"
        className="btn secondary"
        disabled={!canSave}
        onClick={onSave}
        title={
          activePresetId
            ? dirty
              ? 'Update current preset'
              : 'No changes to save'
            : 'Save current selection as a new preset'
        }
      >
        Save
      </button>

      <button
        type="button"
        className="btn secondary selection-presets-delete"
        disabled={!canDelete}
        onClick={onDelete}
        title="Delete current preset"
        aria-label="Delete current preset"
      >
        ×
      </button>
    </div>
  )
}
