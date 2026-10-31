import { describe, expect, it } from 'vitest'
import { applyInstallCompatibility, pendingCompatibilitySteps } from './compatibility'
import type { InstallRun, InstallStep } from './types'

function run(): InstallRun {
  const steps: InstallStep[] = ['bubb_revert_pathfinding:0', 'EEex:1', 'cdtweaks:0'].map((componentId, i) => ({
    stepId: String(i), phase: 'single', modId: 'download', componentId,
    componentLabel: componentId, tp2Path: '', stagedFolderName: '',
    weiduNumber: null, languageIndex: null, status: 'queued',
    warnings: [], errors: [], resultLines: [],
  }))
  return { runId: 'test', game: 'bg2', steps, cursor: 0, runState: 'idle', breakpointStepIds: [], plannedSnapshots: [], logDir: '' }
}

describe('install compatibility preflight', () => {
  it('records why an inapplicable fix was skipped and preserves step identities', () => {
    const original = run()
    const next = applyInstallCompatibility(original, [{ stepId: '0', action: 'skip', reason: 'Windows patch on native Linux' }])
    expect(next.steps[0]!.status).toBe('skipped')
    expect(next.steps[0]!.warnings).toEqual(['Windows patch on native Linux'])
    expect(next.steps.map((step) => step.stepId)).toEqual(['0', '1', '2'])
    expect(original.steps[0]!.status).toBe('queued')
  })

  it('blocks the whole plan before applying any skips', () => {
    const original = run()
    expect(() => applyInstallCompatibility(original, [
      { stepId: '0', action: 'skip', reason: 'Inapplicable' },
      { stepId: '1', action: 'block', reason: 'Deselect EEex' },
    ])).toThrow('Deselect EEex')
    expect(original.steps.every((step) => step.status === 'queued')).toBe(true)
  })

  it('checks only unfinished steps at or after the cursor on resume', () => {
    const current = run()
    current.cursor = 1
    current.steps[1]!.status = 'alreadyInstalled'
    expect(pendingCompatibilitySteps(current).map((step) => step.stepId)).toEqual(['2'])
    expect(() => applyInstallCompatibility(current, [{ stepId: '1', action: 'block', reason: 'Old step' }])).not.toThrow()
  })
})
