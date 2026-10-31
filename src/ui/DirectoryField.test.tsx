import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDesktopApp, pickDirectory } from '../lib/desktop/fsDialogs'
import { mountReact } from '../test/react'
import { DirectoryField } from './DirectoryField'

vi.mock('../lib/desktop/fsDialogs', () => ({ isDesktopApp: vi.fn(), pickDirectory: vi.fn() }))

describe('directory field dialog integration', () => {
  let ui: ReturnType<typeof mountReact>
  const onValidate = vi.fn()
  const mapPickedPath = vi.fn((path: string) => `${path}/My project`)

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.clearAllMocks()
    vi.mocked(isDesktopApp).mockReturnValue(true)
    vi.mocked(pickDirectory).mockResolvedValue(null)
    ui = mountReact()
    function Harness() {
      const [value, setValue] = useState('/existing')
      return <DirectoryField id="destination" label="Destination" value={value} onChange={setValue}
        browseTitle="Choose destination" onValidate={onValidate} mapPickedPath={mapPickedPath} />
    }
    ui.render(<Harness />)
  })
  afterEach(() => { ui.unmount(); vi.unstubAllGlobals() })

  function browse() { return ui.container.querySelector<HTMLButtonElement>('.outlined-text-field-action')! }
  function input() { return ui.container.querySelector<HTMLInputElement>('#destination')! }

  it('maps a picked folder into a project destination and validates that exact path', async () => {
    vi.mocked(pickDirectory).mockResolvedValue('/games/Zażółć')
    await ui.click(browse())
    expect(pickDirectory).toHaveBeenCalledExactlyOnceWith('Choose destination')
    expect(input().value).toBe('/games/Zażółć/My project')
    expect(onValidate).toHaveBeenCalledExactlyOnceWith('/games/Zażółć/My project')
  })

  it('keeps the current path and does not validate when the picker is cancelled', async () => {
    await ui.click(browse())
    expect(input().value).toBe('/existing')
    expect(mapPickedPath).not.toHaveBeenCalled()
    expect(onValidate).not.toHaveBeenCalled()
  })

  it('preserves typed paths without applying the Browse-only transformation', async () => {
    await ui.input('destination', '/games/custom')
    expect(input().value).toBe('/games/custom')
    expect(mapPickedPath).not.toHaveBeenCalled()
    expect(pickDirectory).not.toHaveBeenCalled()
  })

  it('disables the native picker in browser preview', async () => {
    vi.mocked(isDesktopApp).mockReturnValue(false)
    ui.render(<DirectoryField id="destination" label="Destination" value="/existing"
      onChange={vi.fn()} browseTitle="Choose destination" />)
    expect(browse().disabled).toBe(true)
    await ui.click(browse())
    expect(pickDirectory).not.toHaveBeenCalled()
  })
})
