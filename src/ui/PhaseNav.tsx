import { IconTip } from './IconTip'
import type { AppPhase } from './PhaseNav.types'

export type { AppPhase } from './PhaseNav.types'

interface Props {
  phase: AppPhase
  onPhaseChange: (phase: AppPhase) => void
  installDisabled?: boolean
  installTitle?: string
  processingPhases?: Partial<Record<AppPhase, boolean>>
}

const BASE_PHASES: { id: AppPhase; label: string }[] = [
  { id: 'components', label: 'Components' },
  { id: 'mods', label: 'Mods' },
  { id: 'install', label: 'Install' },
]

export function PhaseNav({
  phase,
  onPhaseChange,
  installDisabled = false,
  installTitle,
  processingPhases,
}: Props) {
  return (
    <nav className="phase-nav" aria-label="App phases">
      <ol className="phase-nav-list">
        {BASE_PHASES.map((item, index) => {
          const active = phase === item.id
          const processing = !!processingPhases?.[item.id]
          const disabled =
            item.id === 'install' ? installDisabled && !processing : false
          const title = item.id === 'install' && !processing ? installTitle : undefined
          const button = (
            <button
              type="button"
              className={`phase-nav-btn${active ? ' active' : ''}${
                disabled ? ' disabled' : ''
              }${processing ? ' processing' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-disabled={disabled || undefined}
              aria-label={
                processing
                  ? `${item.label}, processing`
                  : undefined
              }
              disabled={disabled}
              onClick={() => {
                if (!disabled) onPhaseChange(item.id)
              }}
            >
              <span
                className={`phase-nav-index${processing ? ' processing' : ''}`}
                aria-hidden="true"
              >
                {processing ? null : index + 1}
              </span>
              <span className="phase-nav-label">{item.label}</span>
            </button>
          )
          return (
            <li key={item.id} className="phase-nav-item">
              {title ? (
                <span className="has-icon-tip phase-nav-tip-host">
                  {button}
                  <IconTip>{title}</IconTip>
                </span>
              ) : (
                button
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
