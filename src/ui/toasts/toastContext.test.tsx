import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { writeNotificationSounds } from '../../lib/ui/notificationPrefs'
import { mountReact } from '../../test/react'
import { ToastProvider, useToast } from './toastContext'

const { isDesktop, appWindow } = vi.hoisted(() => ({
  isDesktop: vi.fn(() => true),
  appWindow: {
    isFocused: vi.fn(async () => false),
    onFocusChanged: vi.fn(async (_handler: (event: { payload: boolean }) => void) => () => {}),
    setOverlayIcon: vi.fn(async (_icon?: ArrayBuffer) => {}),
  },
}))

vi.mock('../../lib/desktop/fsDialogs', () => ({ isDesktopApp: isDesktop }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => appWindow }))

function Notifications() {
  const { pushToast } = useToast()
  return (
    <>
      <button onClick={() => pushToast({ tone: 'success', sound: true, message: 'Download finished' })}>Download</button>
      <button onClick={() => pushToast({ tone: 'error', sound: true, message: 'Install failed' })}>Install</button>
      <button onClick={() => pushToast({ tone: 'success', message: 'Copied' })}>Copy</button>
    </>
  )
}

const icon = new ArrayBuffer(4)
let ui: ReturnType<typeof mountReact>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => icon })))
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows')
  writeNotificationSounds(false)
  ui = mountReact()
})

afterEach(() => {
  ui.unmount()
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps background completions readable until focus returns and clears their shared badge', async () => {
  await act(async () => ui.render(<ToastProvider><Notifications /></ToastProvider>))
  await ui.click(ui.button('Download'))
  await ui.click(ui.button('Install'))
  await ui.click(ui.button('Copy'))
  expect(appWindow.setOverlayIcon.mock.calls).toEqual([[icon]])

  await act(async () => vi.advanceTimersByTimeAsync(60_000))
  expect(ui.container.textContent).toContain('Download finished')
  expect(ui.container.textContent).toContain('Install failed')
  expect(ui.container.textContent).not.toContain('Copied')

  const [onFocusChanged] = appWindow.onFocusChanged.mock.calls[0]!
  await act(async () => onFocusChanged({ payload: true }))
  expect(appWindow.setOverlayIcon.mock.calls).toEqual([[icon], []])
  expect(ui.container.textContent).toContain('Download finished')
  expect(ui.container.textContent).toContain('Install failed')
  await act(async () => vi.advanceTimersByTimeAsync(4500))
  expect(ui.container.querySelector('.app-toast-host')).toBeNull()

  await ui.click(ui.button('Download'))
  expect(appWindow.setOverlayIcon).toHaveBeenCalledTimes(2)
})

it('lets notifications expire normally outside the Windows desktop app', async () => {
  isDesktop.mockReturnValueOnce(false).mockReturnValueOnce(false)
  ui.render(<ToastProvider><Notifications /></ToastProvider>)
  await ui.click(ui.button('Download'))
  await act(async () => vi.advanceTimersByTimeAsync(4500))
  expect(ui.container.querySelector('.app-toast-host')).toBeNull()
  expect(appWindow.onFocusChanged).not.toHaveBeenCalled()
  expect(appWindow.setOverlayIcon).not.toHaveBeenCalled()
})
