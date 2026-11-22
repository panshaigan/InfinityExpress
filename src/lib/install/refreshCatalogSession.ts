import { buildInstallPlan } from './planBuilder'
import { nextActionableCursor } from './cursor'
import {
  buildPlanFingerprint,
  normalizeInstallRunForRestore,
  type PersistedInstallSession,
} from '../ui/appSessionPrefs'
import type { InstallSequenceModel, SelectedGame } from '../xml/schema'
import type { InstallStep } from './types'

function identity(step: Pick<InstallStep, 'phase' | 'modId' | 'componentId'>): string {
  return JSON.stringify([step.phase, step.modId, step.componentId])
}

/** Refresh the plan while retaining history only for the same component, mod, and phase. */
export function refreshCatalogSession(
  model: InstallSequenceModel,
  game: SelectedGame,
  selectedIds: ReadonlySet<string>,
  session: PersistedInstallSession,
): PersistedInstallSession {
  if (session.run.game !== game) throw new Error('The saved install belongs to a different engine.')
  const run = normalizeInstallRunForRestore(session.run)
  const oldSteps = new Map(run.steps.map(step => [identity(step), step]))
  const steps: InstallStep[] = buildInstallPlan(model, selectedIds, game).map(plan => {
    const old = oldSteps.get(identity(plan))
    return old
      ? { ...old, ...plan, status: old.status, warnings: old.warnings, errors: old.errors, resultLines: old.resultLines }
      : { ...plan, tp2Path: '', stagedFolderName: '', weiduNumber: null, languageIndex: null, progress: null }
  })
  const newIds = new Map(steps.map(step => [identity(step), step.stepId]))
  const remap = new Map(run.steps.map(step => [step.stepId, newIds.get(identity(step))]))
  const selectedStepId = session.ui.selectedStepId ? remap.get(session.ui.selectedStepId) ?? null : null
  const samePlan = session.planFingerprint === buildPlanFingerprint(game, selectedIds) &&
    run.steps.length === steps.length && run.steps.every((step, index) => identity(step) === identity(steps[index]))
  // A changed plan always waits for the user to review/resume it.
  const runState = samePlan ? run.runState : run.runState === 'idle' ? 'idle' : 'paused'
  return {
    ...session,
    planFingerprint: buildPlanFingerprint(game, selectedIds),
    run: {
      ...run,
      runState,
      artifactsCleaned: samePlan ? run.artifactsCleaned : false,
      steps,
      cursor: samePlan ? run.cursor : nextActionableCursor(steps, 0),
      breakpointStepIds: run.breakpointStepIds.flatMap(id => remap.get(id) ? [remap.get(id)!] : []),
      plannedSnapshots: run.plannedSnapshots.flatMap(snapshot => {
        const stepId = remap.get(snapshot.stepId)
        return stepId ? [{ ...snapshot, stepId }] : []
      }),
    },
    ui: {
      ...session.ui,
      selectedStepId,
      selectedComponentId: session.ui.selectedComponentId && selectedIds.has(session.ui.selectedComponentId)
        ? session.ui.selectedComponentId : null,
    },
    transport: { paused: session.transport.paused || runState === 'paused', runState },
  }
}
