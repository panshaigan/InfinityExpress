import type { StepResult } from '../desktop/weiduInstall'
import { consoleLineTone, stripConsoleTs } from './consoleLineHighlight'

function lastNonEmptyLine(text: string | null | undefined): string | null {
  if (!text) return null
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  return lines.length > 0 ? lines[lines.length - 1]! : null
}

function lastErrorHighlightLine(lines: readonly string[] | undefined): string | null {
  if (!lines?.length) return null
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!
    if (consoleLineTone(line) === 'error') {
      return stripConsoleTs(line)
    }
  }
  return null
}

function failureMessage(context?: {
  stderrTail?: string | null
  highlightLines?: readonly string[]
}): string | null {
  return (
    lastNonEmptyLine(context?.stderrTail) ??
    lastErrorHighlightLine(context?.highlightLines) ??
    null
  )
}

function formatExitCodeLine(
  exitCode: number | null,
  message: string | null,
): string {
  const codeLabel =
    exitCode == null ? 'Exit code unknown' : `Exit code ${exitCode}`
  return message ? `${codeLabel} — ${message}` : codeLabel
}

/** Build human-readable error lines for a failed WeiDU install step. */
export function buildStepFailureErrors(
  result: StepResult,
  context?: {
    stderrTail?: string | null
    highlightLines?: readonly string[]
  },
): string[] {
  const message = failureMessage(context)

  if (result.timedOut) {
    const lines = ['Install timed out']
    if (message) lines.push(message)
    else if (result.exitCode == null) {
      lines.push('No exit code received')
    }
    return lines
  }

  return [formatExitCodeLine(result.exitCode, message)]
}
