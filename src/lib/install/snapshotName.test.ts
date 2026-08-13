import { describe, expect, it } from 'vitest'
import { defaultSnapshotName } from './snapshotName'

describe('defaultSnapshotName', () => {
  it('formats snapshot-{Ymd-His} in local time', () => {
    const name = defaultSnapshotName(new Date(2026, 7, 13, 19, 5, 7))
    expect(name).toBe('snapshot-20260813-190507')
  })
})
