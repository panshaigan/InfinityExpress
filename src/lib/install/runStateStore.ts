import {
  ensureDir,
  isDesktopApp,
  readTextFile,
  writeTextFileAt,
} from '../desktop/fsDialogs'
import {
  parsePersistedInstallSession,
  type InstallRunRef,
  type PersistedInstallSession,
} from '../ui/appSessionPrefs'
import { joinLogPath } from './stepLogs'

export const RUN_STATE_FILE = 'run-state.json'

export function installRunStatePath(logDir: string): string {
  return joinLogPath(logDir, RUN_STATE_FILE)
}

export function installRunRefFromSession(
  session: PersistedInstallSession,
): InstallRunRef {
  return {
    runId: session.run.runId,
    logDir: session.run.logDir,
  }
}

/** Write full install session beside the run logs (pretty JSON). */
export async function writeInstallRunState(
  logDir: string,
  session: PersistedInstallSession,
): Promise<void> {
  if (!isDesktopApp() || !logDir.trim()) return
  const dir = logDir.trim()
  await ensureDir(dir)
  await writeTextFileAt(
    installRunStatePath(dir),
    `${JSON.stringify(session, null, 2)}\n`,
  )
}

/** Read `run-state.json` from a run folder. Returns null if missing/invalid. */
export async function readInstallRunState(
  logDir: string,
): Promise<PersistedInstallSession | null> {
  if (!isDesktopApp() || !logDir.trim()) return null
  const text = await readTextFile(installRunStatePath(logDir.trim()))
  if (!text?.trim()) return null
  try {
    return parsePersistedInstallSession(JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

function rewritePath(
  path: string | undefined,
  fromPrefix: string,
  toPrefix: string,
): string | undefined {
  if (!path) return path
  const n = path.replace(/\\/g, '/')
  if (n === fromPrefix || n.startsWith(`${fromPrefix}/`)) {
    return `${toPrefix}${n.slice(fromPrefix.length)}`
  }
  return path
}

/** Rewrite absolute log paths after a project folder rename. */
export function rewritePersistedInstallPaths(
  session: PersistedInstallSession,
  fromPrefix: string,
  toPrefix: string,
): PersistedInstallSession {
  const from = fromPrefix.replace(/\\/g, '/').replace(/\/$/, '')
  const to = toPrefix.replace(/\\/g, '/').replace(/\/$/, '')
  return {
    ...session,
    run: {
      ...session.run,
      logDir: rewritePath(session.run.logDir, from, to) ?? session.run.logDir,
      steps: session.run.steps.map((step) => ({
        ...step,
        stdoutLogPath: rewritePath(step.stdoutLogPath, from, to),
        stderrLogPath: rewritePath(step.stderrLogPath, from, to),
        debugLogPath: rewritePath(step.debugLogPath, from, to),
      })),
    },
  }
}

/**
 * After the project directory was renamed on disk, rewrite paths inside
 * `run-state.json` (file already lives under `newLogDir`).
 */
export async function rewriteInstallRunStateLogDir(
  oldLogDir: string,
  newLogDir: string,
): Promise<void> {
  const existing = await readInstallRunState(newLogDir)
  if (!existing) return
  const from = oldLogDir.replace(/\\/g, '/').replace(/\/$/, '')
  const to = newLogDir.replace(/\\/g, '/').replace(/\/$/, '')
  const rewritten = rewritePersistedInstallPaths(existing, from, to)
  await writeInstallRunState(newLogDir, rewritten)
}
