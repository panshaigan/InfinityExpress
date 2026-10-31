import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { stageModIntoGameDir } from '../desktop/weiduInstall'
import { resolveModForInstall } from './modResolution'
import type { ModListingCache } from './types'

vi.mock('../desktop/weiduInstall', () => ({
  stageModIntoGameDir: vi.fn(async (_root, _mod, gameDir) => `${gameDir}/fixture/setup-fixture.tp2`),
  listWeiduLanguages: vi.fn(async () => []),
  listWeiduComponents: vi.fn(async () => [{ index: 0, number: 0, name: 'Fixture', label: [] }]),
}))

describe('mod resolution cache paths', () => {
  beforeEach(() => vi.clearAllMocks())
  const { model } = parseInstallSequence('<installSequence><base><component id="fixture:0" modId="download" /></base></installSequence>')
  const components = model.componentsInOrder

  it('stages separately for case-distinct Linux game directories', async () => {
    const cache: ModListingCache = new Map()
    await resolveModForInstall(cache, '/tools/weidu', '/mods', '/games/BG', 'download', components)
    await resolveModForInstall(cache, '/tools/weidu', '/mods', '/games/bg', 'download', components)
    expect(stageModIntoGameDir).toHaveBeenCalledTimes(2)
  })

  it('shares cache entries for equivalent Windows paths', async () => {
    const cache: ModListingCache = new Map()
    await resolveModForInstall(cache, 'weidu.exe', 'D:/mods', 'D:\\Games\\BG', 'download', components)
    await resolveModForInstall(cache, 'weidu.exe', 'D:/mods', 'd:/games/bg/', 'download', components)
    expect(stageModIntoGameDir).toHaveBeenCalledTimes(1)
  })
})
