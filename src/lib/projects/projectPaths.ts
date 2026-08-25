import type { GameFolderKey } from '../ui/gameFolderPrefs'
import type { SelectedGame } from '../xml/schema'

function normalizeDataRoot(dataRoot: string): string {
  return dataRoot.replace(/\\/g, '/').replace(/\/$/, '')
}

function assertSafeSegment(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`${label} must not contain a path separator`)
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new Error(`${label} is invalid`)
  }
  return trimmed
}

const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/** Sanitize a display name into a single Windows-safe path segment. */
export function sanitizeProjectFolderName(name: string): string {
  let s = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  s = s.replace(/^\.+/, '').replace(/\.+$/, '').trim()
  if (!s) s = 'project'
  if (WIN_RESERVED.test(s)) s = `_${s}`
  return s
}

/**
 * Leaf folder name appended under a browsed modding destination parent.
 * EET BG1 gets `" (BG1)"` so it stays distinct from the BG2 install.
 */
export function destinationLeafName(
  projectName: string,
  key: GameFolderKey,
  engine: SelectedGame,
): string {
  const base = sanitizeProjectFolderName(projectName)
  if (engine === 'eet' && key === 'bg1') return `${base} (BG1)`
  return base
}

/** Join a picked parent directory with a destination leaf (browse-only). */
export function appendDestinationLeaf(picked: string, leaf: string): string {
  const parent = picked.replace(/[/\\]+$/, '')
  const segment = assertSafeSegment(leaf, 'destination leaf')
  const sep = picked.includes('\\') ? '\\' : '/'
  return `${parent}${sep}${segment}`
}

/**
 * Pick a unique folder name among `taken` (case-insensitive).
 * On collision appends ` (2)`, ` (3)`, …
 */
export function allocateUniqueFolderName(
  desired: string,
  taken: Iterable<string>,
): string {
  const base = sanitizeProjectFolderName(desired)
  const takenSet = new Set(
    [...taken].map((t) => t.trim().toLowerCase()).filter(Boolean),
  )
  if (!takenSet.has(base.toLowerCase())) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`
    if (!takenSet.has(candidate.toLowerCase())) return candidate
  }
  return `${base} (${Date.now()})`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local install-run folder stamp: `YYYY-MM-DD_HH-mm-ss`. */
export function formatRunStamp(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`
}

let lastRunStamp = ''
let runStampSeq = 1

/** Mint a human-readable run id; same-second mints get `-2`, `-3`, … */
export function newInstallRunId(now = new Date()): string {
  const stamp = formatRunStamp(now)
  if (stamp === lastRunStamp) {
    runStampSeq += 1
    return `${stamp}-${runStampSeq}`
  }
  lastRunStamp = stamp
  runStampSeq = 1
  return stamp
}

/** Test helper: reset same-second run-id sequencing. */
export function resetRunStampSeqForTests(): void {
  lastRunStamp = ''
  runStampSeq = 1
}

export function projectsRoot(dataRoot: string): string {
  return `${normalizeDataRoot(dataRoot)}/projects`
}

/** Downloaded / acquired mod folders under the main data folder. */
export function modsRoot(dataRoot: string): string {
  return `${normalizeDataRoot(dataRoot)}/mods`
}

export function projectDir(dataRoot: string, folderName: string): string {
  return `${projectsRoot(dataRoot)}/${assertSafeSegment(folderName, 'folderName')}`
}

export function installRunLogDir(
  dataRoot: string,
  folderName: string,
  runId: string,
): string {
  return `${projectDir(dataRoot, folderName)}/${assertSafeSegment(runId, 'runId')}`
}
