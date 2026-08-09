import { IconTip } from './IconTip'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

export function RailCollapseButton({ collapsed, onToggle }: Props) {
  const label = collapsed
    ? 'Expand station rail (\\)'
    : 'Collapse station rail (\\)'

  return (
    <button
      type="button"
      className="rail-collapse has-icon-tip"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand station rail' : 'Collapse station rail'}
    >
      {collapsed ? '»' : '«'}
      <IconTip>{label}</IconTip>
    </button>
  )
}
