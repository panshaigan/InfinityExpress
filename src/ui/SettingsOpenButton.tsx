import { IconTip } from './IconTip'

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

export function SettingsOpenButton({
  settingsOpen,
  onOpenSettings,
  tipAlign = 'center',
}: {
  settingsOpen: boolean
  onOpenSettings: () => void
  tipAlign?: 'center' | 'end'
}) {
  return (
    <button
      type="button"
      className="btn secondary top-bar-help top-bar-settings has-icon-tip"
      aria-haspopup="dialog"
      aria-expanded={settingsOpen}
      aria-label="Settings"
      onClick={onOpenSettings}
    >
      <SettingsGearIcon />
      <IconTip align={tipAlign}>Settings</IconTip>
    </button>
  )
}
