interface Props {
  lines: readonly string[]
}

export function InstallOrderPreview({ lines }: Props) {
  if (lines.length === 0) return null

  return (
    <>
      {lines.map((line, i) => {
        const sep = line.indexOf(';')
        const componentId = sep >= 0 ? line.slice(0, sep) : line
        const label = sep >= 0 ? line.slice(sep + 1) : ''
        return (
          <div key={`${i}:${componentId}`} className="export-install-order-line">
            <span className="export-install-order-id">{componentId}</span>
            {sep >= 0 ? (
              <>
                <span className="export-install-order-sep">;</span>
                <span className="export-install-order-label">{label}</span>
              </>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
