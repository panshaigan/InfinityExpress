import { collectConditionIdsFromExpr } from '../selection/conditions'
import type { RelationIndex } from '../selection/relations'
import type { InstallSequenceModel } from '../xml/schema'
import { buildInstallPlan } from './planBuilder'
import { isStepDone, nextActionableCursor } from './cursor'
import type {
  ComponentRunStatus,
  InstallRun,
  InstallRunState,
  InstallStep,
} from './types'

export type InstallLockMode = 'none' | 'working' | 'halted'

export interface InstallLockTransport {
  paused?: boolean
  runState?: InstallRunState
}

export interface InstallLock {
  mode: InstallLockMode
  cursor: number
  lockedComponentIds: ReadonlySet<string>
  installedComponentIds: ReadonlySet<string>
  installedModCodenames: ReadonlySet<string>
  componentStepIndex: ReadonlyMap<string, number>
}

const PHYSICALLY_INSTALLED: ReadonlySet<ComponentRunStatus> = new Set([
  'succeeded',
  'succeededWithWarnings',
  'alreadyInstalled',
])

function isPhysicallyInstalled(status: ComponentRunStatus): boolean {
  return PHYSICALLY_INSTALLED.has(status)
}

function isWorkingRunState(runState: InstallRunState): boolean {
  return runState === 'running' || runState === 'waitingForInput'
}

export function deriveInstallLock(
  run: InstallRun | null,
  _transport?: InstallLockTransport | null,
): InstallLock {
  const empty: InstallLock = {
    mode: 'none',
    cursor: 0,
    lockedComponentIds: new Set(),
    installedComponentIds: new Set(),
    installedModCodenames: new Set(),
    componentStepIndex: new Map(),
  }
  if (!run || run.runState === 'idle') return empty

  const lockedComponentIds = new Set<string>()
  const installedComponentIds = new Set<string>()
  const installedModCodenames = new Set<string>()
  const componentStepIndex = new Map<string, number>()

  for (let i = 0; i < run.steps.length; i++) {
    const step = run.steps[i]!
    componentStepIndex.set(step.componentId, i)
    if (i < run.cursor) {
      lockedComponentIds.add(step.componentId)
      installedModCodenames.add(step.modId.toLowerCase())
    }
    if (isPhysicallyInstalled(step.status)) {
      installedComponentIds.add(step.componentId)
    }
  }

  const mode: InstallLockMode = isWorkingRunState(run.runState) ? 'working' : 'halted'

  return {
    mode,
    cursor: run.cursor,
    lockedComponentIds,
    installedComponentIds,
    installedModCodenames,
    componentStepIndex,
  }
}

function alwaysIfRelatedIds(
  componentId: string,
  model: InstallSequenceModel,
  relationIndex: RelationIndex,
): string[] {
  const related: string[] = []
  const comp = model.componentsById.get(componentId)
  for (const id of collectConditionIdsFromExpr(comp?.attrs.alwaysIf)) {
    related.push(id)
  }
  for (const refId of relationIndex.alwaysIfReferrers.get(componentId) ?? []) {
    related.push(refId)
  }
  return related
}

export function isComponentSelectionLocked(
  componentId: string,
  lock: InstallLock,
  model: InstallSequenceModel,
  relationIndex: RelationIndex,
): boolean {
  if (lock.mode === 'none') return false
  if (lock.mode === 'working') return true

  const stepIndex = lock.componentStepIndex.get(componentId)
  if (stepIndex != null && stepIndex < lock.cursor) return true

  for (const relatedId of alwaysIfRelatedIds(componentId, model, relationIndex)) {
    if (lock.lockedComponentIds.has(relatedId)) return true
  }
  return false
}

export function isModActionLocked(codename: string, lock: InstallLock): boolean {
  if (lock.mode === 'none') return false
  if (lock.mode === 'working') return true
  return lock.installedModCodenames.has(codename.toLowerCase())
}

export function canRemoveStepFromPlan(
  stepIndex: number,
  stepStatus: ComponentRunStatus,
  lock: InstallLock,
): boolean {
  if (lock.mode !== 'halted') return false
  if (stepIndex < lock.cursor) return false
  return !isStepDone(stepStatus)
}

type PlanStep = ReturnType<typeof buildInstallPlan>[number]

function defaultStepFields(plan: PlanStep): InstallStep {
  return {
    ...plan,
    tp2Path: '',
    stagedFolderName: '',
    weiduNumber: null,
    languageIndex: null,
    status: 'queued',
    warnings: plan.warnings ?? [],
    errors: plan.errors ?? [],
    resultLines: plan.resultLines ?? [],
    progress: null,
  }
}

/** Reconcile run steps with a rebuilt plan after cursor-safe selection changes. */
export function syncRunWithPlan(run: InstallRun, planSteps: PlanStep[]): InstallRun {
  const oldByComponentId = new Map(run.steps.map((s) => [s.componentId, s]))
  const newSteps: InstallStep[] = planSteps.map((plan) => {
    const old = oldByComponentId.get(plan.componentId)
    if (old) {
      return {
        ...old,
        stepId: plan.stepId,
        phase: plan.phase,
        modId: plan.modId,
        componentLabel: plan.componentLabel,
      }
    }
    return defaultStepFields(plan)
  })

  const cursorComponentId = run.steps[run.cursor]?.componentId
  let newCursor = cursorComponentId
    ? newSteps.findIndex((s) => s.componentId === cursorComponentId)
    : run.cursor
  if (newCursor < 0) {
    newCursor = nextActionableCursor(newSteps, 0)
  }
  newCursor = Math.min(Math.max(0, newCursor), newSteps.length)

  const validStepIds = new Set(newSteps.map((s) => s.stepId))
  const breakpointStepIds = run.breakpointStepIds.filter((id) => validStepIds.has(id))

  return {
    ...run,
    steps: newSteps,
    cursor: newCursor,
    breakpointStepIds,
  }
}
