import { describe, expect, it } from 'vitest'
import {
  componentXmlId,
  createComponentTagDraft,
  serializeComponentTag,
} from './componentTag'

describe('component tag generation', () => {
  it('prefers the first non-empty WeiDU LABEL for the XML id', () => {
    expect(componentXmlId({ label: ['', 'MY_COMPONENT'], number: 12 }, 'mymod')).toBe(
      'MY_COMPONENT',
    )
  })

  it('falls back to the WeiDU id and designated number', () => {
    expect(componentXmlId({ label: [], number: 150 }, 'cdtweaks')).toBe(
      'cdtweaks:150',
    )
  })

  it('serializes stable attributes and escapes XML values', () => {
    const draft = createComponentTagDraft(
      {
        index: 0,
        number: 10,
        name: 'Use "A & B" <now>',
        label: ['example_label'],
      },
      'example',
      'Example-Download',
    )
    draft.label = 'A > B'
    draft.core = true
    draft.engine = ['pst', 'bg', 'eet1']
    draft.recommended = 'fixes'
    draft.complexity = 'minor'
    draft.default = true

    expect(serializeComponentTag(draft)).toBe(
      '<component id="example_label" name="Use &quot;A &amp; B&quot; &lt;now&gt;" label="A &gt; B" core="1" modId="Example-Download" engine="bg,eet1,pst" recommended="fixes" complexity="minor" default="1" />',
    )
  })
})
