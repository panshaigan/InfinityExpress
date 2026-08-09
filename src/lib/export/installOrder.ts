import { parseEngineTokens } from '../engine/matchEngine'
import type { ComponentNode, InstallSequenceModel } from '../xml/schema'

/** `all` = full flat list; EET tabs filter by engine token. */
export type ExportPhase = 'all' | 'eet1' | 'eet'

export function componentMatchesExportPhase(
  component: ComponentNode,
  phase: ExportPhase,
): boolean {
  if (phase === 'all') return true
  const tokens = parseEngineTokens(component.effectiveEngine)
  if (tokens.length === 0) return phase === 'eet'
  if (phase === 'eet1') return tokens.includes('eet1')
  return tokens.includes('eet')
}

export function buildInstallOrderLines(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  phase: ExportPhase = 'all',
): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const c of model.componentsInOrder) {
    if (!selectedIds.has(c.componentId)) continue
    if (c.attrs.noExport) continue
    if (!componentMatchesExportPhase(c, phase)) continue
    if (seen.has(c.componentId)) continue
    seen.add(c.componentId)
    lines.push(`${c.componentId};${c.attrs.name ?? c.attrs.label ?? c.componentId}`)
  }
  return lines
}

export function buildInstallOrderText(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  phase: ExportPhase = 'all',
): string {
  const lines = buildInstallOrderLines(model, selectedIds, phase)
  return lines.length ? lines.join('\n') + '\n' : ''
}

/** Ensure a downloadable name ends with `.txt`. */
export function normalizeExportFilename(name: string, fallback: string): string {
  const trimmed = name.trim()
  const base = trimmed || fallback
  return /\.txt$/i.test(base) ? base : `${base}.txt`
}

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadInstallOrder(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  filename = 'install-order.txt',
  phase: ExportPhase = 'all',
) {
  const text = buildInstallOrderText(model, selectedIds, phase)
  downloadText(text, normalizeExportFilename(filename, 'install-order.txt'))
}
