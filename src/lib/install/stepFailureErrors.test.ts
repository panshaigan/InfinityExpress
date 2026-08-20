import { describe, expect, it } from 'vitest'
import type { StepResult } from '../desktop/weiduInstall'
import { buildStepFailureErrors } from './stepFailureErrors'

function baseResult(overrides: Partial<StepResult> = {}): StepResult {
  return {
    exitCode: 1,
    stdoutPath: '/tmp/stdout.log',
    stderrPath: '/tmp/stderr.log',
    debugPath: null,
    logVerified: false,
    timedOut: false,
    cancelled: false,
    durationMs: 1000,
    ...overrides,
  }
}

describe('buildStepFailureErrors', () => {
  it('formats timeout with optional message', () => {
    const lines = buildStepFailureErrors(baseResult({ timedOut: true, exitCode: null }), {
      stderrTail: 'first\nWeiDU failed badly',
    })
    expect(lines).toEqual(['Install timed out', 'WeiDU failed badly'])
  })

  it('formats unknown exit code with stderr tail', () => {
    const lines = buildStepFailureErrors(baseResult({ exitCode: null }), {
      stderrTail: 'process aborted',
    })
    expect(lines).toEqual(['Exit code unknown — process aborted'])
  })

  it('formats known exit code with stderr tail', () => {
    const lines = buildStepFailureErrors(baseResult({ exitCode: 2 }), {
      stderrTail: 'component failed',
    })
    expect(lines).toEqual(['Exit code 2 — component failed'])
  })

  it('falls back to last error-toned highlight line', () => {
    const lines = buildStepFailureErrors(baseResult({ exitCode: 1 }), {
      highlightLines: [
        '[12:00:00] Installing',
        '[12:00:01] ERROR: could not install',
      ],
    })
    expect(lines).toEqual(['Exit code 1 — ERROR: could not install'])
  })

  it('returns bare exit code when no message is available', () => {
    const lines = buildStepFailureErrors(baseResult({ exitCode: 5 }))
    expect(lines).toEqual(['Exit code 5'])
  })
})
