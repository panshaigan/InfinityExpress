import type { PersistedInstallSession } from '../ui/appSessionPrefs'
import { writeInstallRunState } from './runStateStore'

const SAVE_DEBOUNCE_MS = 400

let timer: ReturnType<typeof setTimeout> | null = null
let pending: PersistedInstallSession | null = null
let writeChain: Promise<void> = Promise.resolve()

function enqueueWrite(session: PersistedInstallSession): Promise<void> {
  writeChain = writeChain
    .then(() => writeInstallRunState(session.run.logDir, session))
    .catch(() => {
      /* disk errors are non-fatal for UI */
    })
  return writeChain
}

/** Debounced write of install run-state.json. Pass null to cancel a pending write. */
export function scheduleInstallRunStateWrite(
  session: PersistedInstallSession | null,
): void {
  if (!session) {
    pending = null
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    return
  }
  pending = session
  if (timer != null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const next = pending
    pending = null
    if (next) void enqueueWrite(next)
  }, SAVE_DEBOUNCE_MS)
}

/** Flush any pending debounced write immediately (awaits the disk write). */
export async function flushInstallRunStateWrite(): Promise<void> {
  if (timer != null) {
    clearTimeout(timer)
    timer = null
  }
  const next = pending
  pending = null
  if (next) await enqueueWrite(next)
  else await writeChain
}
