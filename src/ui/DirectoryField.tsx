import { isDesktopApp, pickDirectory } from '../lib/desktop/fsDialogs'
import { OutlinedTextField } from './OutlinedTextField'

interface Props {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  browseTitle: string
}

export function DirectoryField({
  id,
  label,
  value,
  onChange,
  placeholder = 'Select folder…',
  browseTitle,
}: Props) {
  const canBrowse = isDesktopApp()

  async function browse() {
    if (!canBrowse) return
    const path = await pickDirectory(browseTitle)
    if (path) onChange(path)
  }

  return (
    <OutlinedTextField
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      trailing={
        <button
          type="button"
          className="btn secondary outlined-text-field-action has-icon-tip"
          onClick={() => void browse()}
          disabled={!canBrowse}
        >
          Browse
          <span className="icon-tip" role="tooltip">
            {canBrowse
              ? browseTitle
              : 'Browse is available in the desktop app'}
          </span>
        </button>
      }
    />
  )
}
