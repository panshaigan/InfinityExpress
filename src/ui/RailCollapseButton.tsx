interface Props {
  collapsed: boolean
  onToggle: () => void
}

export function RailCollapseButton({ collapsed, onToggle }: Props) {
  return (
    <button
      type="button"
      className="rail-collapse"
      onClick={onToggle}
      title={collapsed ? 'Expand station rail (\\)' : 'Collapse station rail (\\)'}
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand station rail' : 'Collapse station rail'}
    >
      {collapsed ? '»' : '«'}
    </button>
  )
}
