export type ConsoleLineTone = 'error' | 'warning' | 'success' | 'skipped' | null

const TS_PREFIX = /^\[[\d]{1,2}:[\d]{2}:[\d]{2}\]\s*/

/** Strip optional leading `[HH:MM:SS]` so timestamps don’t affect keyword matches. */
export function stripConsoleTs(line: string): string {
  return line.replace(TS_PREFIX, '')
}

/**
 * Keyword highlight for WeiDU / Results console lines.
 * Priority: error > warning > successfully/successful > skipped.
 */
export function consoleLineTone(line: string): ConsoleLineTone {
  const lower = stripConsoleTs(line).toLowerCase()
  if (!lower) return null
  if (lower.includes('error')) return 'error'
  if (lower.includes('warning')) return 'warning'
  if (lower.includes('successfully') || lower.includes('successful')) return 'success'
  if (lower.includes('skipped')) return 'skipped'
  return null
}

export function consoleLineToneClass(tone: ConsoleLineTone): string {
  if (!tone) return ''
  return ` install-console-line-${tone}`
}
