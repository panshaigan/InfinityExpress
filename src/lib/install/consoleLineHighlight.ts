export type ConsoleLineTone = 'error' | 'warning' | 'success' | 'skipped' | null

/** Match optional leading `[HH:MM:SS]` console stamp (with following space). */
export const CONSOLE_TS_PREFIX = /^\[[\d]{1,2}:[\d]{2}:[\d]{2}\]\s*/

const TS_PREFIX = CONSOLE_TS_PREFIX

/** Whole-word error/errors — rejects alphanumeric suffixes like ERROR10.WAV. */
const ERROR_TOKEN = /(?<![a-z0-9])errors?(?![a-z0-9])/i
/** Whole-word warning/warnings — same token rule as error. */
const WARNING_TOKEN = /(?<![a-z0-9])warnings?(?![a-z0-9])/i

/** Strip optional leading `[HH:MM:SS]` so timestamps don’t affect keyword matches. */
export function stripConsoleTs(line: string): string {
  return line.replace(TS_PREFIX, '')
}

/** Split a stamped console line into `{ ts, body }` (ts includes brackets, no trailing space). */
export function splitConsoleTs(line: string): { ts: string | null; body: string } {
  const m = line.match(CONSOLE_TS_PREFIX)
  if (!m) return { ts: null, body: line }
  const stamped = m[0]
  const ts = stamped.trimEnd()
  return { ts, body: line.slice(stamped.length) }
}

/**
 * Keyword highlight for WeiDU / Results console lines.
 * Priority: error > warning > successfully/successful > skipped.
 */
export function consoleLineTone(line: string): ConsoleLineTone {
  const lower = stripConsoleTs(line).toLowerCase()
  if (!lower) return null
  if (ERROR_TOKEN.test(lower)) return 'error'
  if (WARNING_TOKEN.test(lower)) return 'warning'
  if (lower.includes('successfully') || lower.includes('successful')) return 'success'
  if (lower.includes('skipped')) return 'skipped'
  return null
}

export function consoleLineToneClass(tone: ConsoleLineTone): string {
  if (!tone) return ''
  return ` install-console-line-${tone}`
}
