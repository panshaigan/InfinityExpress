import type { ReactNode } from 'react'
import { isDesktopApp, pickDirectory } from '../lib/desktop/fsDialogs'
import { IconTip } from './IconTip'
import { OutlinedTextField } from './OutlinedTextField'

interface Props {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /** Fires on blur and after Browse with the current value (validate / persist). */
  onValidate?: (value: string) => void
  placeholder?: string
  browseTitle: string
  /** Optional secondary text (e.g. detected exe FileVersion). */
  hint?: string | null
  /** Validation message when the folder is not a valid game dir. */
  error?: string | null
  required?: boolean
  /** Help tip shown via a trailing ? control (GitHub-token pattern). */
  tip?: ReactNode
  tipAriaLabel?: string
}

export function DirectoryField({
  id,
  label,
  value,
  onChange,
  onValidate,
  placeholder = 'Select folder…',
  browseTitle,
  hint,
  error = null,
  required = false,
  tip,
  tipAriaLabel = 'About this field',
}: Props) {
  const canBrowse = isDesktopApp()
  const labelWithHint = hint?.trim() ? `${label} (${hint.trim()})` : label

  async function browse() {
    if (!canBrowse) return
    const path = await pickDirectory(browseTitle)
    if (path) {
      onChange(path)
      onValidate?.(path)
    }
  }

  return (
    <OutlinedTextField
      id={id}
      label={labelWithHint}
      value={value}
      onChange={onChange}
      onBlur={() => onValidate?.(value)}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      error={error}
      required={required}
      trailing={
        <>
          {tip != null ? (
            <span className="has-icon-tip settings-github-tip-host">
              <button
                type="button"
                className="btn secondary outlined-text-field-action settings-github-tip-btn"
                aria-label={tipAriaLabel}
              >
                ?
              </button>
              <IconTip>{tip}</IconTip>
            </span>
          ) : null}
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
        </>
      }
    />
  )
}
