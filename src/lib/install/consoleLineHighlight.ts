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
  if (lower.includes('skipped') || lower.includes('skipping')) return 'skipped'
  return null
}

/** WeiDU predicate / game-check skip: `SKIPPING: [component]`. */
export function weiduOutputIndicatesSkipped(
  lines: readonly string[] | string | null | undefined,
): boolean {
  if (lines == null) return false
  const list = typeof lines === 'string' ? lines.split(/\r?\n/) : lines
  return list.some((line) => /skipping\s*:/i.test(stripConsoleTs(line)))
}

/** WeiDU success line: `SUCCESSFULLY INSTALLED …`. */
export function weiduOutputIndicatesSuccessfullyInstalled(
  lines: readonly string[] | string | null | undefined,
): boolean {
  if (lines == null) return false
  const list = typeof lines === 'string' ? lines.split(/\r?\n/) : lines
  return list.some((line) =>
    /successfully\s+installed/i.test(stripConsoleTs(line)),
  )
}

export function consoleLineToneClass(tone: ConsoleLineTone): string {
  if (!tone) return ''
  return ` install-console-line-${tone}`
}

export type CommandLinePartKind = 'plain' | 'tag' | 'path'

export interface CommandLinePart {
  text: string
  kind: CommandLinePartKind
}

/** First arg looks like an exe / filesystem path (not a prose message). */
function looksLikePathToken(token: string): boolean {
  const bare = token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token
  if (!bare) return false
  if (/\.(exe|bat|cmd|sh)$/i.test(bare)) return true
  return /[\\/]/.test(bare)
}

/**
 * Highlight leading `[tag]` and the WeiDU/setup exe path on Commands lines.
 * Body should already have the optional `[HH:MM:SS]` stamp stripped.
 */
export function splitCommandLineBody(body: string): CommandLinePart[] {
  if (!body) return []
  const tagMatch = body.match(/^(\[[^\]]+\])(\s*)(.*)$/)
  if (!tagMatch) return [{ text: body, kind: 'plain' }]

  const parts: CommandLinePart[] = [{ text: tagMatch[1]!, kind: 'tag' }]
  const space = tagMatch[2] ?? ''
  const rest = tagMatch[3] ?? ''
  if (space) parts.push({ text: space, kind: 'plain' })
  if (!rest) return parts

  const quoted = rest.match(/^("(?:\\.|[^"\\])*")([\s\S]*)$/)
  if (quoted && looksLikePathToken(quoted[1]!)) {
    parts.push({ text: quoted[1]!, kind: 'path' })
    if (quoted[2]) parts.push({ text: quoted[2], kind: 'plain' })
    return parts
  }

  const unquoted = rest.match(/^(\S+)([\s\S]*)$/)
  if (unquoted && looksLikePathToken(unquoted[1]!)) {
    parts.push({ text: unquoted[1]!, kind: 'path' })
    if (unquoted[2]) parts.push({ text: unquoted[2], kind: 'plain' })
    return parts
  }

  parts.push({ text: rest, kind: 'plain' })
  return parts
}

export function commandLinePartClass(kind: CommandLinePartKind): string {
  if (kind === 'tag') return 'install-console-cmd-tag'
  if (kind === 'path') return 'install-console-cmd-path'
  return ''
}
