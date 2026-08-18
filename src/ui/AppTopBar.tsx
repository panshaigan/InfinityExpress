import { type SelectedGame } from '../lib/xml/schema'
import { IconTip } from './IconTip'
import { SelectionPresetsBar } from './SelectionPresetsBar'
import { SettingsOpenButton } from './SettingsOpenButton'
import { PhaseNav, type AppPhase } from './PhaseNav'
import { RestartIcon } from './install/InstallControlIcons'

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
  projectName?: string | null
  onSwitchProject?: () => void
  switchProjectDisabled?: boolean
  switchProjectTip?: string
  onResetAll?: () => void
  resetAllDisabled?: boolean
  resetAllTip?: string
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

function ProjectsIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M1.5 3.25A1.75 1.75 0 0 1 3.25 1.5h5.5c.55 0 1.05.26 1.37.68l.13.17.88 1.15H13.5A1.5 1.5 0 0 1 15 4.5v7A1.5 1.5 0 0 1 13.5 13h-11A1.5 1.5 0 0 1 1 11.5v-8.25ZM3.25 2.75a.75.75 0 0 0-.75.75V4h5.82l-.6-.8a.25.25 0 0 0-.2-.1h-4.27ZM2.25 5.25v6.25c0 .14.11.25.25.25h11a.25.25 0 0 0 .25-.25v-6A.25.25 0 0 0 13.5 5.25H2.25Z" />
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
  projectName = null,
  onSwitchProject,
  switchProjectDisabled = false,
  switchProjectTip = 'Projects',
  onResetAll,
  resetAllDisabled = false,
  resetAllTip = 'Reset installation and component selection',
}: Props) {
  return (
    <header className="top-bar">
      {onSwitchProject ? (
        <button
          type="button"
          className="btn secondary top-bar-help top-bar-settings has-icon-tip"
          aria-label="Projects"
          disabled={switchProjectDisabled}
          aria-disabled={switchProjectDisabled || undefined}
          onClick={onSwitchProject}
        >
          <ProjectsIcon />
          <IconTip align="end">{switchProjectTip}</IconTip>
        </button>
      ) : null}
      {onResetAll ? (
        <button
          type="button"
          className="btn secondary top-bar-help top-bar-settings has-icon-tip"
          disabled={resetAllDisabled}
          aria-label="Reset all"
          onClick={onResetAll}
        >
          <RestartIcon />
          <IconTip align="end">{resetAllTip}</IconTip>
        </button>
      ) : null}
      <PhaseNav
        phase={phase}
        onPhaseChange={onPhaseChange}
        installDisabled={installDisabled}
        installTitle={installTitle}
        processingPhases={processingPhases}
      />
      <div className="top-bar-actions">
        <span className="stats">
          {selectedModsCount} mods · {selectedCount} comps
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
          <IconTip>{exportTip}</IconTip>
        </button>
        <SettingsOpenButton
          settingsOpen={settingsOpen}
          onOpenSettings={onOpenSettings}
        />
        <button
          type="button"
          className="brand has-icon-tip"
          aria-haspopup="dialog"
          aria-expanded={aboutOpen}
          aria-label="About iNfinity eXpress"
          onClick={onOpenAbout}
        >
          <span className="brand-title">iNeX</span>
          <IconTip>About</IconTip>
        </button>
      </div>
    </header>
  )
}
