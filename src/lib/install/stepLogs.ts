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

/** `{safeMod}-{safeComponent}` — file stem shared by mod/component/results streams. */
export function stepStreamStem(step: {
  modId: string
  componentId: string
}): string {
  return `${safeLogSegment(step.modId)}-${safeLogSegment(step.componentId)}`
}

/**
 * Stem from a step folder dirname (`012-mod-comp` → `mod-comp`).
 * Matches Rust `stream_stem_from_folder`.
 */
export function stepStreamStemFromFolder(stepFolder: string): string {
  const trimmed = stepFolder.trim()
  const i = trimmed.indexOf('-')
  if (i >= 0 && i < trimmed.length - 1) return trimmed.slice(i + 1)
  return trimmed || 'step'
}

export function joinLogPath(dir: string, name: string): string {
  const base = dir.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${name}`
}

export function modLogFileName(stem: string): string {
  return `${stem}-mod.log`
}

export function componentLogFileName(stem: string): string {
  return `${stem}-component.log`
}

export function resultsLogFileName(stem: string): string {
  return `${stem}-results.log`
}

export function stepStreamPaths(
  stepDir: string,
  step: { modId: string; componentId: string },
) {
  const stem = stepStreamStem(step)
  return {
    modPath: joinLogPath(stepDir, modLogFileName(stem)),
    componentPath: joinLogPath(stepDir, componentLogFileName(stem)),
    resultsPath: joinLogPath(stepDir, resultsLogFileName(stem)),
  }
}

export function stepDirFromLogPath(logPath: string | undefined | null): string | null {
  if (!logPath?.trim()) return null
  const norm = logPath.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  if (i <= 0) return null
  return norm.slice(0, i)
}

/** Legacy attempt files `stem-1.log`, `stem-2.log`, … */
async function readLegacyConcatenatedAttemptLogs(
  stepDir: string,
  stem: 'mod' | 'component' | 'results',
): Promise<string> {
  const parts: string[] = []
  for (let n = 1; n < 10_000; n++) {
    const modText = await readTextFile(joinLogPath(stepDir, `mod-${n}.log`))
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

function streamFileName(
  streamStem: string,
  kind: 'mod' | 'component' | 'results',
): string {
  if (kind === 'mod') return modLogFileName(streamStem)
  if (kind === 'component') return componentLogFileName(streamStem)
  return resultsLogFileName(streamStem)
}

/**
 * Read the single named stream file for a step folder.
 * Falls back to legacy `mod-N.log` / `component-N.log` / `results-N.log` concat.
 */
export async function readStepStreamLog(
  stepDir: string,
  kind: 'mod' | 'component' | 'results',
  step?: { modId: string; componentId: string } | null,
): Promise<string> {
  const folder = stepDir.replace(/\\/g, '/').replace(/\/$/, '')
  const folderName = folder.slice(folder.lastIndexOf('/') + 1)
  const stem = step ? stepStreamStem(step) : stepStreamStemFromFolder(folderName)
  const text = await readTextFile(joinLogPath(stepDir, streamFileName(stem, kind)))
  if (text != null) return text.replace(/\s+$/, '')
  return readLegacyConcatenatedAttemptLogs(stepDir, kind)
}

export async function anyStepStreamNonempty(
  stepDir: string,
  kind: 'mod' | 'component' | 'results',
  step?: { modId: string; componentId: string } | null,
): Promise<boolean> {
  const folder = stepDir.replace(/\\/g, '/').replace(/\/$/, '')
  const folderName = folder.slice(folder.lastIndexOf('/') + 1)
  const stem = step ? stepStreamStem(step) : stepStreamStemFromFolder(folderName)
  const text = await readTextFile(joinLogPath(stepDir, streamFileName(stem, kind)))
  if (text != null) return text.trim().length > 0
  const legacy = await readLegacyConcatenatedAttemptLogs(stepDir, kind)
  return legacy.trim().length > 0
}

/** @deprecated Prefer `readStepStreamLog` — kept as alias for callers mid-migration. */
export async function readConcatenatedAttemptLogs(
  stepDir: string,
  stem: 'mod' | 'component' | 'results',
): Promise<string> {
  return readStepStreamLog(stepDir, stem)
}

/** @deprecated Prefer `anyStepStreamNonempty`. */
export async function anyAttemptLogNonempty(
  stepDir: string,
  stem: 'mod' | 'component' | 'results',
): Promise<boolean> {
  return anyStepStreamNonempty(stepDir, stem)
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
