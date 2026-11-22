import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AcquireJobState } from '../../hooks/useModAcquireJob'
import { mountReact } from '../../test/react'
import { AcquireJobDialog } from './AcquireJobDialog'

const completedCheck: AcquireJobState = {
  kind: 'check',
  running: false,
  minimized: false,
  open: true,
  entries: [
    { codename: 'update-a', status: 'updated', message: '1 → 2' },
    { codename: 'missing', status: 'ok', message: 'Remote 1 (N/A)' },
    { codename: 'current', status: 'up_to_date', message: 'Up to date' },
    { codename: 'failed', status: 'failed', message: 'Check failed' },
    { codename: 'update-b', status: 'updated', message: '2 → 3' },
  ],
  activeCodename: null,
  progress: null,
  doneCount: 5,
  totalCount: 5,
  summary: null,
  rateLimitHint: false,
}

let ui: ReturnType<typeof mountReact>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  ui = mountReact()
})
afterEach(() => {
  ui.unmount()
  vi.unstubAllGlobals()
})

function renderReport(job: AcquireJobState) {
  const onDownloadUpdates = vi.fn()
  const onClose = vi.fn()
  ui.render(
    <AcquireJobDialog
      job={job}
      onMinimize={vi.fn()}
      onCancel={vi.fn()}
      onClose={onClose}
      onDownloadUpdates={onDownloadUpdates}
    />,
  )
  return { onDownloadUpdates, onClose }
}

it('downloads only the mods the report marked as having an update', async () => {
  const { onDownloadUpdates, onClose } = renderReport(completedCheck)
  await ui.click(ui.button('Download all updates'))
  expect(onDownloadUpdates).toHaveBeenCalledWith(['update-a', 'update-b'])

  const close = ui.button('×')
  expect(close.getAttribute('aria-label')).toBe('Close')
  await ui.click(close)
  expect(onClose).toHaveBeenCalledOnce()
})

it('offers bulk updates only after a check finds an update', () => {
  const withoutUpdates = completedCheck.entries.filter((entry) => entry.status !== 'updated')
  for (const job of [
    { ...completedCheck, running: true },
    { ...completedCheck, entries: withoutUpdates },
    { ...completedCheck, kind: 'acquire' as const },
  ]) {
    renderReport(job)
    expect(ui.container.textContent).not.toContain('Download all updates')
  }
})
