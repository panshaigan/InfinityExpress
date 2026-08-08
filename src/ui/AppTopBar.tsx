import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import { SelectionPresetsBar } from './SelectionPresetsBar'
import { PhaseNav, type AppPhase } from './PhaseNav'

interface PresetItem {
  id: string
  name: string
}

interface Props {
  phase: AppPhase
  onPhaseChange: (phase: AppPhase) => void
  game: SelectedGame | null
  selectedModsCount: number
  selectedCount: number
  presets: PresetItem[]
  activePresetId: string | null
  activePresetName: string | null
  dirty: boolean
  canSave: boolean
  canDelete: boolean
  onSelectPreset: (id: string | null) => void
  onSave: () => void
  onRename: (name: string) => void
  onDelete: () => void
  keyboardHelpOpen: boolean
  onOpenKeyboardHelp: () => void
  onExport: () => void
}

export function AppTopBar({
  phase,
  onPhaseChange,
  game,
  selectedModsCount,
  selectedCount,
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
  keyboardHelpOpen,
  onOpenKeyboardHelp,
  onExport,
}: Props) {
  return (
    <header className="top-bar">
      <div className="brand">
        <h1>Infinity Express</h1>
        <p>Your mod route</p>
      </div>
      <PhaseNav phase={phase} onPhaseChange={onPhaseChange} />
      <div className="top-bar-actions">
        <span className="engine-badge">
          Engine: <strong>{game ? GAME_LABELS[game] : 'not set'}</strong>
        </span>
        <span className="stats">
          {selectedModsCount} mods · {selectedCount} components
        </span>
        <SelectionPresetsBar
          disabled={game == null}
          presets={presets}
          activePresetId={activePresetId}
          activePresetName={activePresetName}
          dirty={dirty}
          canSave={canSave}
          canDelete={canDelete}
          onSelectPreset={onSelectPreset}
          onSave={onSave}
          onRename={onRename}
          onDelete={onDelete}
        />
        <button
          type="button"
          className="btn secondary top-bar-help"
          aria-haspopup="dialog"
          aria-expanded={keyboardHelpOpen}
          title="Keyboard shortcuts"
          onClick={onOpenKeyboardHelp}
        >
          ?
        </button>
        <button
          type="button"
          className="btn"
          disabled={selectedCount === 0}
          title="Preview and save install order"
          onClick={onExport}
        >
          Export
        </button>
      </div>
    </header>
  )
}
