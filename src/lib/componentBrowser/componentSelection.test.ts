import { describe, expect, it } from 'vitest'
import type { WeiduComponentInfo } from '../install/types'
import {
  componentBrowserKey,
  componentExistsInSequence,
  findComponentByIdentity,
  normalizeComponentIdentitySet,
  toggleComponentSelection,
} from './componentSelection'

const components: WeiduComponentInfo[] = [
  { index: 0, number: 0, name: 'Ordinary', label: [] },
  { index: 1, number: 10, name: 'Alternative A', label: ['ALT_A'], subgroup: 'Mode' },
  { index: 2, number: 20, name: 'Alternative B', label: ['ALT_B'], subgroup: 'mode' },
  { index: 3, number: 30, name: 'Other group', label: [], subgroup: 'Style' },
]

describe('component browser selection', () => {
  it('toggles ordinary components independently', () => {
    const selected = toggleComponentSelection(new Set(), components[0], components)
    expect([...selected]).toEqual([componentBrowserKey(components[0])])
    expect(toggleComponentSelection(selected, components[0], components).size).toBe(0)
  })

  it('replaces a selected alternative in the same subgroup', () => {
    let selected = toggleComponentSelection(new Set(), components[1], components)
    selected = toggleComponentSelection(selected, components[3], components)
    selected = toggleComponentSelection(selected, components[2], components)
    expect([...selected]).toEqual([
      componentBrowserKey(components[3]),
      componentBrowserKey(components[2]),
    ])
  })

  it('matches existing XML ids by label or numbered fallback without case sensitivity', () => {
    expect(
      componentExistsInSequence(
        normalizeComponentIdentitySet(new Set(['ALT_B'])),
        components[2],
        'example',
      ),
    ).toBe(true)
    expect(
      componentExistsInSequence(
        normalizeComponentIdentitySet(new Set(['EXAMPLE:30'])),
        components[3],
        'example',
      ),
    ).toBe(true)
  })

  it('finds a requested component by label or designated-number fallback', () => {
    expect(findComponentByIdentity(components, 'example', 'alt_a')).toBe(components[1])
    expect(findComponentByIdentity(components, 'example', 'EXAMPLE:30')).toBe(
      components[3],
    )
  })
})
