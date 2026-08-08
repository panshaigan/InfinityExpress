import { pickDirectory } from '../lib/desktop/fsDialogs'

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
  async function browse() {
    const path = await pickDirectory(browseTitle)
    if (path) onChange(path)
  }

  return (
    <div className="engine-folder-field">
      <label className="engine-folder-label" htmlFor={id}>
        {label}
      </label>
      <div className="engine-folder-controls">
        <input
          id={id}
          type="text"
          className="engine-folder-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn secondary"
          onClick={() => void browse()}
          title={browseTitle}
        >
          Browse
        </button>
      </div>
    </div>
  )
}
