import {
  INSTALL_CONSOLE_MAX_LINES,
  INSTALL_CONSOLE_TAIL_BYTES,
  trimConsoleLines,
} from './consoleLimits'
import { isDesktopApp, readTextFileTail } from '../desktop/fsDialogs'
import { joinLogPath } from './stepLogs'

export interface LoadedRunConsole {
  consoleLines: string[]
  commandLines: string[]
  resultLines: string[]
}

function linesFromText(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
}

function trimTabLines(lines: string[]): string[] {
  return lines.slice(-Math.min(999, INSTALL_CONSOLE_MAX_LINES))
}

/**
 * Reload install console tabs from on-disk run logs (capped tails).
 */
export async function loadInstallConsoleFromRunLog(
  logDir: string,
): Promise<LoadedRunConsole> {
  if (!isDesktopApp() || !logDir.trim()) {
    return { consoleLines: [], commandLines: [], resultLines: [] }
  }
  const stdoutPath = joinLogPath(logDir, 'run-stdout.log')
  const stderrPath = joinLogPath(logDir, 'run-stderr.log')
  const commandsPath = joinLogPath(logDir, 'run-commands.log')
  const resultsPath = joinLogPath(logDir, 'run-results.log')
  const [stdoutText, stderrText, commandsText, resultsText] = await Promise.all([
    readTextFileTail(stdoutPath, INSTALL_CONSOLE_TAIL_BYTES),
    readTextFileTail(stderrPath, INSTALL_CONSOLE_TAIL_BYTES),
    readTextFileTail(commandsPath, INSTALL_CONSOLE_TAIL_BYTES),
    readTextFileTail(resultsPath, INSTALL_CONSOLE_TAIL_BYTES),
  ])
  return mergeRunLogLines(stdoutText, stderrText, commandsText, resultsText)
}

/** @internal test helper */
export function mergeRunLogLines(
  stdoutText: string | null,
  stderrText: string | null,
  commandsText: string | null = null,
  resultsText: string | null = null,
): LoadedRunConsole {
  const stdoutLines = linesFromText(stdoutText)
  const stderrLines = linesFromText(stderrText)
  const consoleLines = trimConsoleLines([...stdoutLines, ...stderrLines])
  const commandLines = trimTabLines(linesFromText(commandsText))
  const resultLines = trimTabLines(linesFromText(resultsText))
  return { consoleLines, commandLines, resultLines }
}
