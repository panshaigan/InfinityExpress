export type AppPhase = 'components' | 'mods' | 'install'

interface Props {
  phase: AppPhase
  onPhaseChange: (phase: AppPhase) => void
}

const PHASES: { id: AppPhase; label: string; disabled?: boolean; title?: string }[] =
  [
    { id: 'components', label: 'Components' },
    { id: 'mods', label: 'Mods' },
    {
      id: 'install',
      label: 'Install',
      disabled: true,
      title: 'Coming with the desktop app',
    },
  ]

export function PhaseNav({ phase, onPhaseChange }: Props) {
  return (
    <nav className="phase-nav" aria-label="App phases">
      <ol className="phase-nav-list">
        {PHASES.map((item, index) => {
          const active = phase === item.id
          return (
            <li key={item.id} className="phase-nav-item">
              <button
                type="button"
                className={`phase-nav-btn${active ? ' active' : ''}${
                  item.disabled ? ' disabled' : ''
                }`}
                aria-current={active ? 'page' : undefined}
                aria-disabled={item.disabled || undefined}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  if (!item.disabled) onPhaseChange(item.id)
                }}
              >
                <span className="phase-nav-index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="phase-nav-label">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
