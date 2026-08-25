import { describe, expect, it } from 'vitest'
import { resolveWeiduStepStatus } from './stepStatus'

describe('resolveWeiduStepStatus', () => {
  it('marks timed out as failed', () => {
    expect(
      resolveWeiduStepStatus({
        timedOut: true,
        exitCode: 0,
        logVerified: true,
        skippedFromOutput: false,
        successfullyInstalledFromOutput: true,
      }),
    ).toBe('failed')
  })

  it('prefers log-verified success over sibling SKIPPING', () => {
    expect(
      resolveWeiduStepStatus({
        timedOut: false,
        exitCode: 0,
        logVerified: true,
        skippedFromOutput: true,
        successfullyInstalledFromOutput: true,
      }),
    ).toBe('succeeded')
  })

  it('treats SUCCESSFULLY INSTALLED + sibling SKIPPING as soft success when log unverified', () => {
    expect(
      resolveWeiduStepStatus({
        timedOut: false,
        exitCode: 0,
        logVerified: false,
        skippedFromOutput: true,
        successfullyInstalledFromOutput: true,
      }),
    ).toBe('succeededWithWarnings')
  })

  it('marks true predicate skip when no success evidence', () => {
    expect(
      resolveWeiduStepStatus({
        timedOut: false,
        exitCode: 0,
        logVerified: false,
        skippedFromOutput: true,
        successfullyInstalledFromOutput: false,
      }),
    ).toBe('skipped')
  })

  it('uses exit 3 as succeededWithWarnings', () => {
    expect(
      resolveWeiduStepStatus({
        timedOut: false,
        exitCode: 3,
        logVerified: false,
        skippedFromOutput: false,
        successfullyInstalledFromOutput: false,
      }),
    ).toBe('succeededWithWarnings')
  })

  it('marks other non-zero exits as failed', () => {
    expect(
      resolveWeiduStepStatus({
        timedOut: false,
        exitCode: 2,
        logVerified: false,
        skippedFromOutput: false,
        successfullyInstalledFromOutput: false,
      }),
    ).toBe('failed')
  })
})
