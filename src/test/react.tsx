import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

/** Small DOM harness for integration tests using the app's real React controls. */
export function mountReact() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  return {
    container,
    render(node: ReactNode) { act(() => root.render(node)) },
    unmount() { act(() => root.unmount()); container.remove() },
    button(text: string) {
      const found = [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === text)
      if (!found) throw new Error(`Missing button: ${text}`)
      return found
    },
    async click(element: HTMLElement) { await act(async () => element.click()) },
    async input(id: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`#${id}`)
      if (!input) throw new Error(`Missing input: ${id}`)
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
