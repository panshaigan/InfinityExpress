import { componentMatchesExportPhase, type ExportPhase } from '../export/installOrder'
import { resolveModLookupKey } from '../mods/loadMods'
import type { ComponentNode, InstallSequenceModel, SelectedGame } from '../xml/schema'
import type { InstallPhase, InstallStep } from './types'

function phasesForGame(game: SelectedGame): { phase: InstallPhase; exportPhase: ExportPhase }[] {
  if (game === 'eet') {
    return [
      { phase: 'eet1', exportPhase: 'eet1' },
      { phase: 'eet', exportPhase: 'eet' },
    ]
  }
  return [{ phase: 'single', exportPhase: 'all' }]
}

function orderedSelectedComponents(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  exportPhase: ExportPhase,
): ComponentNode[] {
  const seen = new Set<string>()
  const out: ComponentNode[] = []
  for (const c of model.componentsInOrder) {
    if (!selectedIds.has(c.componentId)) continue
    if (c.attrs.noExport) continue
    if (!componentMatchesExportPhase(c, exportPhase)) continue
    if (seen.has(c.componentId)) continue
    seen.add(c.componentId)
    out.push(c)
  }
  return out
}

function componentLabel(c: ComponentNode): string {
  return c.attrs.label ?? c.attrs.name ?? c.componentId
}

function makeStepId(phase: InstallPhase, index: number): string {
  return `${phase}:${String(index).padStart(4, '0')}`
}

/**
 * Build install steps grouped by consecutive same modId.
 * tp2Path and weiduNumbers are placeholders until mod resolution runs.
 */
export function buildInstallPlan(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  game: SelectedGame,
): Omit<InstallStep, 'tp2Path' | 'stagedFolderName' | 'weiduNumbers' | 'languageIndex'>[] {
  const rawSteps: Omit<
    InstallStep,
    'tp2Path' | 'stagedFolderName' | 'weiduNumbers' | 'languageIndex'
  >[] = []
  let stepCounter = 0

  for (const { phase, exportPhase } of phasesForGame(game)) {
    const components = orderedSelectedComponents(model, selectedIds, exportPhase)
    let batchModId: string | null = null
    let batchComponentIds: string[] = []
    let batchLabels: string[] = []

    const flush = () => {
      if (!batchModId || batchComponentIds.length === 0) return
      rawSteps.push({
        stepId: makeStepId(phase, stepCounter++),
        phase,
        modId: batchModId,
        componentIds: [...batchComponentIds],
        componentLabels: [...batchLabels],
        status: 'queued',
        warnings: [],
        errors: [],
      })
      batchModId = null
      batchComponentIds = []
      batchLabels = []
    }

    for (const c of components) {
      const modId = resolveModLookupKey(model, c)?.trim() || c.componentId
      if (batchModId != null && modId !== batchModId) flush()
      batchModId = modId
      batchComponentIds.push(c.componentId)
      batchLabels.push(componentLabel(c))
    }
    flush()
  }

  return rawSteps
}

/** Expand batched steps into one row per component for the install table. */
export interface InstallTableRow {
  stepId: string
  stepIndex: number
  order: number
  modId: string
  componentId: string
  componentLabel: string
  status: InstallStep['status']
  phase: InstallPhase
}

export function expandStepsToTableRows(steps: InstallStep[]): InstallTableRow[] {
  const rows: InstallTableRow[] = []
  let order = 1
  steps.forEach((step, stepIndex) => {
    step.componentIds.forEach((componentId, i) => {
      rows.push({
        stepId: step.stepId,
        stepIndex,
        order: order++,
        modId: step.modId,
        componentId,
        componentLabel: step.componentLabels[i] ?? componentId,
        status: step.status,
        phase: step.phase,
      })
    })
  })
  return rows
}
