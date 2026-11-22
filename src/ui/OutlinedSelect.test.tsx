import { act, useState } from 'react'
import { expect, it, vi } from 'vitest'
import { mountReact } from '../test/react'
import { OutlinedSelect } from './OutlinedSelect'

it('narrows searchable options as you type and commits only on selection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const ui = mountReact()
  const onChange = vi.fn()

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <OutlinedSelect
        label="Author"
        searchLabel="Search authors"
        value="Alice"
        open={open}
        onOpenChange={setOpen}
        onChange={onChange}
        options={[
          { value: '', label: 'All' },
          { value: 'Alice', label: 'Alice' },
          { value: 'David Smith', label: 'David Smith' },
          { value: 'Sam Smith', label: 'Sam Smith' },
        ]}
      />
    )
  }

  function options() {
    return [...document.querySelectorAll('[role="option"]')]
  }

  function type(input: HTMLInputElement, text: string) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  function press(key: string) {
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      )
    })
  }

  try {
    ui.render(<Harness />)
    const trigger = ui.container.querySelector<HTMLButtonElement>('button[aria-label="Author"]')!
    await ui.click(trigger)
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    expect(document.activeElement).toBe(input)

    type(input, 'zz')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('No matches')
    press('Enter')
    expect(onChange).not.toHaveBeenCalled()

    type(input, ' MIT ')
    expect(options().map((option) => option.textContent)).toEqual(['David Smith', 'Sam Smith'])
    expect(document.activeElement).toBe(input)
    expect(onChange).not.toHaveBeenCalled()

    press('ArrowDown')
    press('ArrowDown')
    press('Enter')
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Sam Smith')
    expect(document.activeElement).toBe(trigger)

    await ui.click(trigger)
    expect(options().map((option) => option.textContent)).toEqual([
      'All', 'Alice', 'David Smith', 'Sam Smith',
    ])
    press('Escape')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  } finally {
    ui.unmount()
    vi.unstubAllGlobals()
  }
})
