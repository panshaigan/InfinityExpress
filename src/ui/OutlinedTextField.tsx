import {
  useId,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
} from 'react'

interface Props {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password' | 'url'
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
  disabled?: boolean
  id?: string
  inputRef?: Ref<HTMLInputElement>
  spellCheck?: boolean
  autoComplete?: string
  onBlur?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  /** Extra class on the root (e.g. layout spans). */
  className?: string
  /** Trailing control (e.g. Browse). */
  trailing?: ReactNode
  /** Validation message; marks the field invalid when set. */
  error?: string | null
}

export function OutlinedTextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  autoFocus = false,
  disabled = false,
  id: idProp,
  inputRef,
  spellCheck = false,
  autoComplete = 'off',
  onBlur,
  onKeyDown,
  className = '',
  trailing,
  error = null,
}: Props) {
  const genId = useId()
  const id = idProp ?? genId
  const errorId = `${id}-error`
  const withAction = trailing != null
  const invalid = Boolean(error?.trim())

  return (
    <div
      className={[
        'outlined-field',
        'outlined-field-control',
        'outlined-text-field',
        withAction ? 'outlined-text-field-with-action' : '',
        disabled ? 'disabled' : '',
        invalid ? 'outlined-field-invalid' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label className="outlined-field-label" htmlFor={id}>
        {label}
        {required ? (
          <>
            {' '}
            <abbr className="has-icon-tip" aria-label="required">
              *
              <span className="icon-tip" role="tooltip">
                required
              </span>
            </abbr>
          </>
        ) : null}
      </label>
      <div className="outlined-text-field-row">
        <input
          ref={inputRef}
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          spellCheck={spellCheck}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
        {trailing}
      </div>
      {invalid ? (
        <p id={errorId} className="outlined-field-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
