import type { ReactNode } from 'react'

interface Props {
  title: string
  children?: ReactNode
  className?: string
}

/** Calm empty-state block for list panes (stations, search, content). */
export function EmptyPanel({ title, children, className = '' }: Props) {
  return (
    <div className={`empty-panel${className ? ` ${className}` : ''}`} role="status">
      <p className="empty-panel-title">{title}</p>
      {children ? <div className="empty-panel-body">{children}</div> : null}
    </div>
  )
}
