/** Parse WeiDU.log installed-component lines. */

export interface WeiduLogEntry {
  tp2Path: string
  languageIndex: number
  componentNumber: number
  raw: string
}

const LINE_RE =
  /^~([^~]+)~ #(\d+) #(\d+)/

export function parseWeiduLogLine(line: string): WeiduLogEntry | null {
  const trimmed = line.trim()
  const m = LINE_RE.exec(trimmed)
  if (!m) return null
  return {
    tp2Path: m[1]!.replace(/\\/g, '/'),
    languageIndex: Number.parseInt(m[2]!, 10),
    componentNumber: Number.parseInt(m[3]!, 10),
    raw: trimmed,
  }
}

export function parseWeiduLog(text: string): WeiduLogEntry[] {
  const out: WeiduLogEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const entry = parseWeiduLogLine(line)
    if (entry) out.push(entry)
  }
  return out
}

/** Normalize tp2 paths for comparison (case-insensitive on Windows-style paths). */
export function tp2PathsMatch(a: string, b: string): boolean {
  const na = a.replace(/\\/g, '/').trim().toLowerCase()
  const nb = b.replace(/\\/g, '/').trim().toLowerCase()
  if (na === nb) return true
  return na.endsWith('/' + nb) || nb.endsWith('/' + na)
}

export function isComponentInstalledInLog(
  logText: string,
  tp2Path: string,
  languageIndex: number,
  componentNumber: number,
): boolean {
  for (const entry of parseWeiduLog(logText)) {
    if (entry.componentNumber !== componentNumber) continue
    if (entry.languageIndex !== languageIndex) continue
    if (tp2PathsMatch(entry.tp2Path, tp2Path)) return true
  }
  return false
}

export function installedNumbersForTp2(
  logText: string,
  tp2Path: string,
  languageIndex: number,
): Set<number> {
  const out = new Set<number>()
  for (const entry of parseWeiduLog(logText)) {
    if (entry.languageIndex !== languageIndex) continue
    if (!tp2PathsMatch(entry.tp2Path, tp2Path)) continue
    out.add(entry.componentNumber)
  }
  return out
}
