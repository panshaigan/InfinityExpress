import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountReact } from '../test/react'
import { ComponentTree } from './ComponentTree'
import { parseInstallSequence } from '../lib/xml/parseInstallSequence'
import { buildDisplayTree } from '../lib/selection/visibility'
import { createInitialSelection, toggleDisplayNode } from '../lib/selection/selectionEngine'

const { model } = parseInstallSequence(`<installSequence><base>
  <mod id="demo" label="Demo" unfolded="1">
    <component id="demo:0" label="Core" core="1" />
    <component id="demo:1" label="Extra" />
    <component id="demo:2" label="Dependent" displayIf="demo:1" />
  </mod>
  <alternatives label="Rules" unfolded="1">
    <component id="rules:0" label="Classic" default="1" />
    <component id="rules:1" label="Modern" />
  </alternatives>
</base></installSequence>`)
const mods = new Map()
const noop = () => {}

describe('rendered component selection', () => {
  let ui: ReturnType<typeof mountReact>
  let selected: ReadonlySet<string>

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    ui = mountReact()
  })
  afterEach(() => {
    ui.unmount()
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    vi.unstubAllGlobals()
  })

  function mount(options: { readonly?: boolean; locked?: ReadonlySet<string> } = {}) {
    function Harness() {
      const [ids, setIds] = useState(() => createInitialSelection(model, 'bg2'))
      const [focused, setFocused] = useState<string | null>(null)
      selected = ids
      return <ComponentTree treeKey={expect.getState().currentTestName!}
        nodes={buildDisplayTree(model.stations[0]!.children, { game: 'bg2', selectedIds: ids })}
        model={model} game="bg2" selectedIds={ids} modsByCodename={mods}
        focusedKey={focused} onFocus={setFocused} onHover={noop} onRandomize={noop}
        onToggle={(node, want) => setIds((prev) => toggleDisplayNode(model, prev, 'bg2', node, want))}
        readonly={options.readonly} selectionLockedIds={options.locked} />
    }
    ui.render(<Harness />)
  }

  function input(label: string) {
    const row = [...ui.container.querySelectorAll<HTMLElement>('[role="treeitem"]')]
      .find((row) => row.querySelector('.tree-label')?.textContent === label)
    const control = row?.querySelector<HTMLInputElement>('input')
    if (!control) throw new Error(`Missing tree control: ${label}`)
    return control
  }

  it('selects cores, updates mixed parent state, and prunes gated components', async () => {
    mount()
    expect(ui.container.textContent).not.toContain('Dependent')
    await ui.click(input('Extra'))
    expect(input('Core').checked).toBe(true)
    expect(input('Extra').checked).toBe(true)
    expect(input('Demo').indeterminate).toBe(true)
    await ui.click(input('Dependent'))
    expect(input('Demo').checked).toBe(true)
    await ui.click(input('Extra'))
    expect(selected.has('demo:2')).toBe(false)
    expect(ui.container.textContent).not.toContain('Dependent')
    await ui.click(input('Core'))
    expect([...selected]).toEqual([])
  })

  it('uses defaults for parent selection and keeps alternative radios mutually exclusive', async () => {
    mount()
    await ui.click(input('Rules'))
    expect(input('Classic').type).toBe('radio')
    expect(input('Classic').checked).toBe(true)
    expect(input('Modern').checked).toBe(false)
    expect(input('Rules').checked).toBe(true)
    await ui.click(input('Modern'))
    expect(input('Classic').checked).toBe(false)
    expect(input('Modern').checked).toBe(true)
    expect(input('Rules').checked).toBe(true)
    expect([...selected]).toEqual(['rules:1'])
  })

  it('prevents editing a finished station', async () => {
    mount({ readonly: true })
    expect([...ui.container.querySelectorAll('input')].every((input) => input.disabled)).toBe(true)
    await ui.click(input('Extra'))
    expect([...selected]).toEqual([])
  })

  it('locks an installed component and its parent while leaving unrelated choices editable', async () => {
    mount({ locked: new Set(['demo:0']) })
    expect(input('Core').disabled).toBe(true)
    expect(input('Demo').disabled).toBe(true)
    expect(input('Modern').disabled).toBe(false)
    await ui.click(input('Modern'))
    expect(selected.has('rules:1')).toBe(true)
  })
})
