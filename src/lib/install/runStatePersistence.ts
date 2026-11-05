import type { PersistedInstallSession } from '../ui/appSessionPrefs'
import { writeInstallRunState } from './runStateStore'

const SAVE_DEBOUNCE_MS = 400

let timer: ReturnType<typeof setTimeout> | null = null
let pending: PersistedInstallSession | null = null
let writeChain: Promise<void> = Promise.resolve()
const failedWrites = new Map<string, { session: PersistedInstallSession; error: unknown }>()

function enqueueWrite(session: PersistedInstallSession): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      await writeInstallRunState(session.run.logDir, session)
      failedWrites.delete(session.run.logDir)
    })
    .catch((error: unknown) => {
      failedWrites.set(session.run.logDir, { session, error })
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
export async function flushInstallRunStateWrite(options?: { throwOnError?: boolean }): Promise<void> {
  if (timer != null) {
    clearTimeout(timer)
    timer = null
  }
  const next = pending
  pending = null
  if (next) await enqueueWrite(next)
  else await writeChain
  if (options?.throwOnError) {
    // A successful save for another project must not conceal an earlier failure.
    // Retry old failures once; a newly failed write is reported to the caller.
    for (const { session } of [...failedWrites.values()]) {
      if (session !== next) await enqueueWrite(session)
    }
    const failed = failedWrites.values().next().value
    if (failed) throw failed.error
  }
}
