import { describe, expect, it } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import {
  resolvePackageTileInfo,
  resolvePresetTileLabel,
  resolveRecommendedTileInfo,
} from './resolvePresetCopy'

const XML = `<?xml version="1.0"?>
<installSequence>
  <gfx>
    <mod id="BGGO" label="Baldur's Gate Graphical Overhaul" recommended="gfx" package="BGGO">
      <component id="bggo:0" label="BGGO core" />
    </mod>
  </gfx>
</installSequence>`

describe('resolvePresetCopy', () => {
  const { model } = parseInstallSequence(XML)

  it('uses catalog label and copy for known recommended tokens', () => {
    const info = resolveRecommendedTileInfo('fixes')
    expect(info.label).toBe('Fixes')
    expect(info.summary).toContain('Essential stability')
    expect(info.typeAndDepth).toContain('Low mechanical impact')
  })

  it('falls back to station labels for ui tokens', () => {
    const info = resolveRecommendedTileInfo('ui')
    expect(info.label).toBe('UI')
    expect(info.summary).toBe('')
  })

  it('uses catalog npc label override', () => {
    expect(resolveRecommendedTileInfo('npc').label).toBe('NPC')
  })

  it('falls back to InstallSequence package label', () => {
    const info = resolvePackageTileInfo('BGGO', model)
    expect(info.label).toBe("Baldur's Gate Graphical Overhaul")
  })

  it('uses catalog package label override when set', () => {
    expect(resolvePackageTileInfo('BGGO', model).label).toBe(
      "Baldur's Gate Graphical Overhaul",
    )
  })

  it('resolvePresetTileLabel matches kind', () => {
    expect(resolvePresetTileLabel('fixes', model, 'recommended')).toBe('Fixes')
    expect(resolvePresetTileLabel('BGGO', model, 'package')).toBe(
      "Baldur's Gate Graphical Overhaul",
    )
  })
})
