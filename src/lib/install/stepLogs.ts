import { appendTextFileAt, readTextFile } from '../desktop/fsDialogs'

/** Dirname-safe segment for mod / component ids in log paths. */
export function safeLogSegment(id: string, maxLen = 40): string {
  return id.replace(/[^\w.-]+/g, '_').slice(0, maxLen) || 'step'
}

export function stepFolderName(
  step: { modId: string; componentId: string },
  index: number,
): string {
  const safeMod = safeLogSegment(step.modId)
  const safeComponent = safeLogSegment(step.componentId)
  return `${String(index + 1).padStart(3, '0')}-${safeMod}-${safeComponent}`
}

export function joinLogPath(dir: string, name: string): string {
  const base = dir.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${name}`
}

export function modLogFileName(attempt: number): string {
  return `mod-${attempt}.log`
}

export function componentLogFileName(attempt: number): string {
  return `component-${attempt}.log`
}

export function resultsLogFileName(attempt: number): string {
  return `results-${attempt}.log`
}

export function stepAttemptPaths(stepDir: string, attempt: number) {
  return {
    modPath: joinLogPath(stepDir, modLogFileName(attempt)),
    componentPath: joinLogPath(stepDir, componentLogFileName(attempt)),
    resultsPath: joinLogPath(stepDir, resultsLogFileName(attempt)),
  }
}

/** Next 1-based attempt index: first missing `mod-N.log` in the step folder. */
export async function nextStepAttempt(stepDir: string): Promise<number> {
  const base = stepDir.trim()
  if (!base) return 1
  for (let n = 1; n < 10_000; n++) {
    const existing = await readTextFile(joinLogPath(base, modLogFileName(n)))
    if (existing == null) return n
  }
  return 1
}

export function stepDirFromLogPath(logPath: string | undefined | null): string | null {
  if (!logPath?.trim()) return null
  const norm = logPath.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  if (i <= 0) return null
  return norm.slice(0, i)
}

/** Concatenate `stem-1.log`, `stem-2.log`, … for every attempt that has a `mod-N.log`. */
export async function readConcatenatedAttemptLogs(
  stepDir: string,
  stem: 'mod' | 'component' | 'results',
): Promise<string> {
  const parts: string[] = []
  for (let n = 1; n < 10_000; n++) {
    const modText = await readTextFile(joinLogPath(stepDir, modLogFileName(n)))
    if (modText == null) break
    if (stem === 'mod') {
      const trimmed = modText.replace(/\s+$/, '')
      if (trimmed) parts.push(trimmed)
      continue
    }
    const text = await readTextFile(joinLogPath(stepDir, `${stem}-${n}.log`))
    if (text == null) continue
    const trimmed = text.replace(/\s+$/, '')
    if (trimmed) parts.push(trimmed)
  }
  return parts.join('\n\n')
}

export async function anyAttemptLogNonempty(
  stepDir: string,
  stem: 'mod' | 'component' | 'results',
): Promise<boolean> {
  for (let n = 1; n < 10_000; n++) {
    const modText = await readTextFile(joinLogPath(stepDir, modLogFileName(n)))
    if (modText == null) return false
    if (stem === 'mod') {
      if (modText.trim().length > 0) return true
      continue
    }
    const text = await readTextFile(joinLogPath(stepDir, `${stem}-${n}.log`))
    if (text != null && text.trim().length > 0) return true
  }
  return false
}

export function runCommandsLogPath(logDir: string): string {
  return joinLogPath(logDir, 'run-commands.log')
}

export function runResultsLogPath(logDir: string): string {
  return joinLogPath(logDir, 'run-results.log')
}

export function appendRunLogLine(logDir: string | null | undefined, file: string, line: string) {
  const dir = logDir?.trim()
  if (!dir) return
  void appendTextFileAt(joinLogPath(dir, file), `${line}\n`).catch(() => {
    /* best-effort disk mirror */
  })
}

export function appendStepResultsLine(
  resultsPath: string | null | undefined,
  line: string,
) {
  const path = resultsPath?.trim()
  if (!path) return
  void appendTextFileAt(path, `${line}\n`).catch(() => {
    /* best-effort disk mirror */
  })
}
