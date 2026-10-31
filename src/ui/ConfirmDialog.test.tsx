import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('destructive action confirmation', () => {
  let container: HTMLDivElement
  let root: Root
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  function render(open = true) {
    act(() => root.render(
      <ConfirmDialog
        open={open}
        title="Remove mod?"
        message="The downloaded files will be removed."
        confirmLabel="Remove"
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    ))
  }

  function button(label: string) {
    return [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
  }

  it('opens with an accessible description and Cancel focused', () => {
    render()
    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent)
      .toBe('Remove mod?')
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent)
      .toBe('The downloaded files will be removed.')
    expect(document.activeElement).toBe(button('Cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms only when the destructive button is clicked', () => {
    render()
    act(() => button('Remove').click())
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels with the Cancel button or Escape', () => {
    render()
    act(() => button('Cancel').click())
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('dismisses a backdrop click but ignores a drag that starts inside the dialog', () => {
    render()
    const backdrop = container.querySelector('[role="presentation"]')!
    const dialog = container.querySelector('[role="dialog"]')!
    act(() => {
      dialog.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onCancel).not.toHaveBeenCalled()
    act(() => {
      backdrop.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not dismiss when clicking the dialog content', () => {
    render()
    const message = container.querySelector('p')!
    act(() => {
      message.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      message.click()
    })
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('removes the dialog and its Escape listener when closed', () => {
    render()
    render(false)
    expect(container.childElementCount).toBe(0)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
