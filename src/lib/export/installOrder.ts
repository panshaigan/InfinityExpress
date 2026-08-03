import type { InstallSequenceModel } from '../xml/schema'

export function buildInstallOrderLines(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const c of model.componentsInOrder) {
    if (!selectedIds.has(c.componentId)) continue
    if (seen.has(c.componentId)) continue
    seen.add(c.componentId)
    lines.push(`${c.componentId};${c.attrs.label ?? c.componentId}`)
  }
  return lines
}

export function buildInstallOrderText(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
): string {
  return buildInstallOrderLines(model, selectedIds).join('\n') + (selectedIds.size ? '\n' : '')
}

export function downloadInstallOrder(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  filename = 'install-order.txt',
) {
  const text = buildInstallOrderText(model, selectedIds)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
