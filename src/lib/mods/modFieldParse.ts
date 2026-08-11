/** Canonical order when joining selected game tokens into a stored Game field. */
export const GAME_TOKENS = ['BG', 'BG1', 'BG2', 'IWD', 'PST'] as const

export type GameToken = (typeof GAME_TOKENS)[number]

/** Tokens shown in the mod editor form (excludes "BG" — auto-merged from BG1+BG2). */
export const GAME_FORM_TOKENS = ['BG1', 'BG2', 'IWD', 'PST'] as const

/** Fixed Mods toolbar Game filter options (plus UI "All"). */
export const GAME_FILTER_OPTIONS = [
  'BG1',
  'BG2',
  'BG1+BG2',
  'IWD',
  'PST',
] as const

export type GameFilterOption = (typeof GAME_FILTER_OPTIONS)[number]

const GAME_TOKEN_SET = new Set<string>(GAME_TOKENS)
const GAME_TOKEN_INDEX = new Map(
  GAME_TOKENS.map((token, index) => [token, index]),
)

const HTML_PREVIEW_PREFIX = 'https://htmlpreview.github.io/?'

export function splitGameTokens(game: string): string[] {
  return game
    .split('-')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Normalize legacy "BG1-BG2" to "BG" on import. */
export function normalizeGameField(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === 'BG1-BG2') return 'BG'
  return trimmed
}

export function joinGameTokens(tokens: readonly string[]): string {
  const unique = new Set<GameToken>()
  for (const raw of tokens) {
    const t = raw.trim()
    if (t && GAME_TOKEN_SET.has(t)) unique.add(t as GameToken)
  }
  return [...unique]
    .sort(
      (a, b) =>
        (GAME_TOKEN_INDEX.get(a) ?? 99) - (GAME_TOKEN_INDEX.get(b) ?? 99),
    )
    .join('-')
}

/** Display form: stored `BG1-BG2` → `BG1, BG2`. */
export function formatGameDisplay(game: string): string {
  return splitGameTokens(game).join(', ')
}

export function modMatchesGameFilter(
  modGame: string,
  filter: string,
): boolean {
  if (!filter) return true
  const tokens = new Set(splitGameTokens(modGame))
  if (filter === 'BG1+BG2' || filter === 'BG1-BG2') {
    return tokens.has('BG1') || tokens.has('BG2') || tokens.has('BG')
  }
  if (filter === 'BG1') return tokens.has('BG1') || tokens.has('BG')
  if (filter === 'BG2') return tokens.has('BG2') || tokens.has('BG')
  return tokens.has(filter)
}

/** Comma-separated co-authors → singular names. */
export function splitAuthorNames(author: string): string[] {
  return author
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Known download hosts → default catalog author when the form field is blank.
 * Does not scrape; GitHub and other hosts return null.
 */
export function authorFromModUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'weaselmods.net' || host.endsWith('.weaselmods.net')) {
      return 'Lava'
    }
    if (host === 'morpheus-mart.com' || host.endsWith('.morpheus-mart.com')) {
      return 'Morpheus562'
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Wrap raw GitHub HTML readmes with htmlpreview so they open as HTML in-browser.
 * Idempotent for URLs already under htmlpreview.github.io.
 */
export function withHtmlPreviewIfNeeded(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.toLowerCase().includes('htmlpreview.github.io/?')) {
    return trimmed
  }
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase()
    if (host !== 'raw.githubusercontent.com') return trimmed
    if (!parsed.pathname.toLowerCase().endsWith('.html')) return trimmed
    return `${HTML_PREVIEW_PREFIX}${trimmed}`
  } catch {
    return trimmed
  }
}
