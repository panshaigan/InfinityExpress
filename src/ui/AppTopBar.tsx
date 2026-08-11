import { GAME_LABELS, type SelectedGame } from '../lib/xml/schema'
import { IconTip } from './IconTip'
import { SelectionPresetsBar } from './SelectionPresetsBar'
import { PhaseNav, type AppPhase } from './PhaseNav'

interface PresetItem {
  id: string
  name: string
}

interface Props {
  phase: AppPhase
  onPhaseChange: (phase: AppPhase) => void
  installDisabled?: boolean
  installTitle?: string
  processingPhases?: Partial<Record<AppPhase, boolean>>
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
  settingsOpen: boolean
  onOpenSettings: () => void
  keyboardHelpOpen: boolean
  onOpenKeyboardHelp: () => void
  aboutOpen: boolean
  onOpenAbout: () => void
  onExport: () => void
  exportDisabled?: boolean
  exportTip?: string
}

function SettingsGearIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6.2 1.4l-.35 1.55a4.9 4.9 0 0 0-1.05.6L3.3 2.9l-1.4 1.4.65 1.5c-.25.33-.45.68-.6 1.05L.4 6.2v2l1.55.35c.15.37.35.72.6 1.05l-.65 1.5 1.4 1.4 1.5-.65c.33.25.68.45 1.05.6l.35 1.55h2l.35-1.55c.37-.15.72-.35 1.05-.6l1.5.65 1.4-1.4-.65-1.5c.25-.33.45-.68.6-1.05L15.6 8.2v-2l-1.55-.35a4.9 4.9 0 0 0-.6-1.05l.65-1.5-1.4-1.4-1.5.65a4.9 4.9 0 0 0-1.05-.6L9.8 1.4h-2Zm.55 1.5h2.5l.28 1.25.2.08c.4.15.77.38 1.1.66l.16.14 1.2-.52.88.88-.52 1.2.14.16c.28.33.51.7.66 1.1l.08.2 1.25.28v2.5l-1.25.28-.08.2a4.4 4.4 0 0 1-.66 1.1l-.14.16.52 1.2-.88.88-1.2-.52-.16.14c-.33.28-.7.51-1.1.66l-.2.08L9.25 14.6h-2.5l-.28-1.25-.2-.08a4.4 4.4 0 0 1-1.1-.66l-.16-.14-1.2.52-.88-.88.52-1.2-.14-.16a4.4 4.4 0 0 1-.66-1.1l-.08-.2L1.4 9.25v-2.5l1.25-.28.08-.2c.15-.4.38-.77.66-1.1l.14-.16-.52-1.2.88-.88 1.2.52.16-.14c.33-.28.7-.51 1.1-.66l.2-.08.28-1.25Z" />
    </svg>
  )
}

function KeyboardIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h10a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 12H3A1.5 1.5 0 0 1 1.5 10.5v-7ZM3 3a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-7A.5.5 0 0 0 13 3H3Zm1 2h1v1H4V5Zm2 0h1v1H6V5Zm2 0h1v1H8V5Zm2 0h1v1h-1V5Zm2 0h1v1h-1V5ZM4 7h1v1H4V7Zm2 0h1v1H6V7Zm2 0h1v1H8V7Zm2 0h1v1h-1V7Zm2 0h1v1h-1V7ZM5 9h6v1H5V9Z" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M3 1.5h6.2L13.5 5.8V13A1.5 1.5 0 0 1 12 14.5H3A1.5 1.5 0 0 1 1.5 13V3A1.5 1.5 0 0 1 3 1.5Zm0 1a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V6.2L8.8 2.5H3Zm1.5 3h5v1.25h-5V5.5Zm0 2.5h5V9.25h-5V8Zm0 2.5h3.5v1.25H4.5V10.5Z" />
    </svg>
  )
}

export function AppTopBar({
  phase,
  onPhaseChange,
  installDisabled,
  installTitle,
  processingPhases,
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
  settingsOpen,
  onOpenSettings,
  keyboardHelpOpen,
  onOpenKeyboardHelp,
  aboutOpen,
  onOpenAbout,
  onExport,
  exportDisabled = false,
  exportTip = 'Preview and save install order',
}: Props) {
  return (
    <header className="top-bar">
      <button
        type="button"
        className="brand has-icon-tip"
        aria-haspopup="dialog"
        aria-expanded={aboutOpen}
        aria-label="About Infinity Express"
        onClick={onOpenAbout}
      >
        <span className="brand-title">Infinity Express</span>
        <IconTip>About</IconTip>
      </button>
      <PhaseNav
        phase={phase}
        onPhaseChange={onPhaseChange}
        installDisabled={installDisabled}
        installTitle={installTitle}
        processingPhases={processingPhases}
      />
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
          className="btn secondary top-bar-help top-bar-settings has-icon-tip"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <SettingsGearIcon />
          <IconTip>Settings</IconTip>
        </button>
        <button
          type="button"
          className="btn secondary top-bar-help top-bar-settings has-icon-tip"
          aria-haspopup="dialog"
          aria-expanded={keyboardHelpOpen}
          aria-label="Keyboard shortcuts"
          onClick={onOpenKeyboardHelp}
        >
          <KeyboardIcon />
          <IconTip>Keyboard shortcuts</IconTip>
        </button>
        <button
          type="button"
          className="btn secondary top-bar-help top-bar-settings has-icon-tip"
          disabled={exportDisabled}
          aria-label={exportTip}
          onClick={onExport}
        >
          <ExportIcon />
          <IconTip align="end">{exportTip}</IconTip>
        </button>
      </div>
    </header>
  )
}
