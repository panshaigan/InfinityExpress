interface Props {
  collapsed: boolean
  onToggle: () => void
}

export function RailCollapseButton({ collapsed, onToggle }: Props) {
  return (
    <button
      type="button"
      className="rail-collapse has-icon-tip"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand station rail' : 'Collapse station rail'}
    >
      {collapsed ? '»' : '«'}
      <span className="icon-tip" role="tooltip">
        {collapsed ? 'Expand station rail (\\)' : 'Collapse station rail (\\)'}
      </span>
    </button>
  )
}
