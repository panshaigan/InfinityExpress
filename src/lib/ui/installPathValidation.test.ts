import { describe, expect, it } from 'vitest'
import {
  defaultSettingsTabForContext,
  resolveSettingsOpenTab,
  settingsTabForMissing,
} from './installPathValidation'

describe('defaultSettingsTabForContext', () => {
  it('opens Project on Components, App on Mods, Vanilla elsewhere', () => {
    expect(defaultSettingsTabForContext('components')).toBe('project')
    expect(defaultSettingsTabForContext('mods')).toBe('app')
    expect(defaultSettingsTabForContext('install')).toBe('vanilla')
    expect(defaultSettingsTabForContext('wizard')).toBe('vanilla')
  })
})

describe('resolveSettingsOpenTab', () => {
  it('prefers a focused missing field over the context default', () => {
    expect(
      resolveSettingsOpenTab({
        initialTab: 'project',
        focusField: 'backupDir',
      }),
    ).toBe('app')
    expect(
      resolveSettingsOpenTab({
        initialTab: 'app',
        highlightMissing: ['vanilla:bg2', 'dest:bg2'],
      }),
    ).toBe('vanilla')
  })

  it('hides Project by falling back to Vanilla backups', () => {
    expect(
      resolveSettingsOpenTab({
        initialTab: 'project',
        hideProjectTab: true,
      }),
    ).toBe('vanilla')
    expect(
      resolveSettingsOpenTab({
        focusField: 'dest:bg1',
        hideProjectTab: true,
      }),
    ).toBe('vanilla')
  })
})

describe('settingsTabForMissing', () => {
  it('maps dest / vanilla / app fields', () => {
    expect(settingsTabForMissing('dest:bg1')).toBe('project')
    expect(settingsTabForMissing('vanilla:bg2')).toBe('vanilla')
    expect(settingsTabForMissing('backupDir')).toBe('app')
    expect(settingsTabForMissing('weiduPath')).toBe('app')
  })
})
