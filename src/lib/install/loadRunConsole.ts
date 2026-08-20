import { consoleLineTone } from './consoleLineHighlight'
import {
  INSTALL_CONSOLE_MAX_LINES,
  INSTALL_CONSOLE_TAIL_BYTES,
  trimConsoleLines,
} from './consoleLimits'
import { isDesktopApp, readTextFileTail } from '../desktop/fsDialogs'

export interface LoadedRunConsole {
  consoleLines: string[]
  resultLines: string[]
}

function joinLogPath(logDir: string, name: string): string {
  const base = logDir.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${name}`
}

function linesFromText(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
}

function resultLinesFromConsole(consoleLines: string[]): string[] {
  return consoleLines.filter((l) => consoleLineTone(l) != null)
}

/**
 * Reload install console Output / Results tabs from on-disk run logs.
 * Commands tab is intentionally left empty — those lines are UI-only.
 */
export async function loadInstallConsoleFromRunLog(
  logDir: string,
): Promise<LoadedRunConsole> {
  if (!isDesktopApp() || !logDir.trim()) {
    return { consoleLines: [], resultLines: [] }
  }
  const stdoutPath = joinLogPath(logDir, 'run-stdout.log')
  const stderrPath = joinLogPath(logDir, 'run-stderr.log')
  const [stdoutText, stderrText] = await Promise.all([
    readTextFileTail(stdoutPath, INSTALL_CONSOLE_TAIL_BYTES),
    readTextFileTail(stderrPath, INSTALL_CONSOLE_TAIL_BYTES),
  ])
  return mergeRunLogLines(stdoutText, stderrText)
}

/** @internal test helper */
export function mergeRunLogLines(
  stdoutText: string | null,
  stderrText: string | null,
): LoadedRunConsole {
  const stdoutLines = linesFromText(stdoutText)
  const stderrLines = linesFromText(stderrText)
  const consoleLines = trimConsoleLines([...stdoutLines, ...stderrLines])
  const resultLines = trimConsoleLines(resultLinesFromConsole(consoleLines)).slice(
    -Math.min(999, INSTALL_CONSOLE_MAX_LINES),
  )
  return { consoleLines, resultLines }
}
