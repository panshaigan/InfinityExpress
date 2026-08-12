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
 * Build one install step per selected component (document order).
 * tp2Path and weiduNumber are placeholders until mod resolution runs.
 */
export function buildInstallPlan(
  model: InstallSequenceModel,
  selectedIds: ReadonlySet<string>,
  game: SelectedGame,
): Omit<InstallStep, 'tp2Path' | 'stagedFolderName' | 'weiduNumber' | 'languageIndex'>[] {
  const rawSteps: Omit<
    InstallStep,
    'tp2Path' | 'stagedFolderName' | 'weiduNumber' | 'languageIndex'
  >[] = []
  let stepCounter = 0

  for (const { phase, exportPhase } of phasesForGame(game)) {
    const components = orderedSelectedComponents(model, selectedIds, exportPhase)
    for (const c of components) {
      const modId = resolveModLookupKey(model, c)?.trim() || c.componentId
      rawSteps.push({
        stepId: makeStepId(phase, stepCounter++),
        phase,
        modId,
        componentId: c.componentId,
        componentLabel: componentLabel(c),
        status: 'queued',
        warnings: [],
        errors: [],
        resultLines: [],
      })
    }
  }

  return rawSteps
}

/** One table row per install step. */
export interface InstallTableRow {
  stepId: string
  stepIndex: number
  /** 1-based install step number. */
  order: number
  modId: string
  componentId: string
  componentLabel: string
  status: InstallStep['status']
  phase: InstallPhase
}

export function expandStepsToTableRows(steps: InstallStep[]): InstallTableRow[] {
  return steps.map((step, stepIndex) => ({
    stepId: step.stepId,
    stepIndex,
    order: stepIndex + 1,
    modId: step.modId,
    componentId: step.componentId,
    componentLabel: step.componentLabel,
    status: step.status,
    phase: step.phase,
  }))
}
