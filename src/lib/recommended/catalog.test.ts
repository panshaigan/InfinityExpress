import { describe, expect, it } from 'vitest'
import { parseInstallSequence } from '../xml/parseInstallSequence'
import { buildRecommendedCatalog, resolvePresetLayout, resolvePresetLayoutSections } from './catalog'

const XML = `<?xml version="1.0"?>
<installSequence>
  <gfx>
    <mod id="BGGO" label="Baldur's Gate Graphical Overhaul" recommended="gfx" package="BGGO" engine="bg,eet">
      <component id="bggo:0" label="BGGO core" />
    </mod>
    <mod id="IDGO" label="Icewind Dale Graphical Overhaul" displayIf="iwd_in_eet" recommended="gfx" package="IDGO" engine="iwd,eet">
      <component id="idgo:0" label="IDGO core" />
    </mod>
    <component id="gfx:base" label="Portrait tweak" recommended="gfx" engine="bg,eet" />
  </gfx>
  <sounds recommended="sounds">
    <component id="sound:base" label="Base sound" engine="bg,eet" />
    <component id="sound:iwd-only" label="IWD voices" engine="iwd" />
  </sounds>
</installSequence>`

describe('buildRecommendedCatalog', () => {
  const { model } = parseInstallSequence(XML)

  it('omits packages with no engine-eligible visible components', () => {
    const groups = buildRecommendedCatalog(model, 'eet')
    const gfx = groups.find((g) => g.token === 'gfx')
    expect(gfx?.packages.map((p) => p.token)).toEqual(['BGGO'])
    expect(gfx?.hasBase).toBe(true)
  })

  it('shows a displayIf-gated package only when the condition is met', () => {
    const hidden = buildRecommendedCatalog(model, 'eet')
    expect(hidden.find((g) => g.token === 'gfx')?.packages.map((p) => p.token)).toEqual(['BGGO'])

    const shown = buildRecommendedCatalog(model, 'eet', new Set(['iwd_in_eet']))
    expect(shown.find((g) => g.token === 'gfx')?.packages.map((p) => p.token)).toEqual([
      'BGGO',
      'IDGO',
    ])
  })

  it('omits iwd-only components from an eet sounds tile', () => {
    const groups = buildRecommendedCatalog(model, 'eet')
    const sounds = groups.find((g) => g.token === 'sounds')
    expect(sounds?.hasBase).toBe(true)
    expect(sounds?.packages).toEqual([])
  })

  it('includes iwd-only components for the iwd engine', () => {
    const groups = buildRecommendedCatalog(model, 'iwd')
    expect(groups.find((g) => g.token === 'gfx')).toBeUndefined()
    expect(groups.find((g) => g.token === 'sounds')?.hasBase).toBe(true)
  })
})

describe('resolvePresetLayoutSections', () => {
  const { model } = parseInstallSequence(XML)

  it('keeps only whitelisted tokens that exist in the catalog', () => {
    const groups = buildRecommendedCatalog(model, 'eet')
    const layout = [
      {
        label: 'Presence',
        rows: [{ tokens: ['gfx', 'missing'] }, { tokens: ['sounds'] }],
      },
    ]
    const resolved = resolvePresetLayoutSections(layout, groups)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.label).toBe('Presence')
    expect(resolved[0]?.rows).toHaveLength(2)
    expect(resolved[0]?.rows[0]?.cells.map((c) => c.token)).toEqual(['gfx'])
    expect(resolved[0]?.rows[1]?.cells.map((c) => c.token)).toEqual(['sounds'])
  })

  it('omits empty sections', () => {
    const groups = buildRecommendedCatalog(model, 'eet')
    const resolved = resolvePresetLayoutSections(
      [{ label: 'Empty', rows: [{ tokens: ['missing'] }] }],
      groups,
    )
    expect(resolved).toEqual([])
  })
})

describe('resolvePresetLayout', () => {
  const { model } = parseInstallSequence(XML)

  it('keeps nested sections on a non-empty tab', () => {
    const groups = buildRecommendedCatalog(model, 'eet')
    const resolved = resolvePresetLayout(
      [
        {
          label: 'Media',
          sections: [
            {
              label: 'Presence',
              rows: [{ tokens: ['gfx', 'missing'] }, { tokens: ['sounds'] }],
            },
            { label: 'Empty', rows: [{ tokens: ['missing'] }] },
          ],
        },
      ],
      groups,
    )
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.label).toBe('Media')
    expect(resolved[0]?.sections).toHaveLength(1)
    expect(resolved[0]?.sections[0]?.label).toBe('Presence')
    expect(resolved[0]?.sections[0]?.rows[0]?.cells.map((c) => c.token)).toEqual(['gfx'])
  })

  it('omits empty tabs', () => {
    const groups = buildRecommendedCatalog(model, 'eet')
    const resolved = resolvePresetLayout(
      [
        {
          label: 'Empty',
          sections: [{ label: 'Missing', rows: [{ tokens: ['missing'] }] }],
        },
        {
          label: 'Media',
          sections: [{ label: 'Sounds', rows: [{ tokens: ['sounds'] }] }],
        },
      ],
      groups,
    )
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.label).toBe('Media')
  })
})
