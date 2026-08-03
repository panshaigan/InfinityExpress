import type { EngineToken, SelectedGame } from '../xml/schema'

/** Games covered by each engine= token. `bg` does not cover EET. */
const TOKEN_COVERS: Record<EngineToken, readonly SelectedGame[]> = {
  bg: ['bg1', 'bg2'],
  bg1: ['bg1'],
  bg2: ['bg2'],
  eet: ['eet'],
  eet1: ['eet'],
  iwd: ['iwd'],
  pst: ['pst'],
}

const KNOWN_TOKENS = new Set<string>(Object.keys(TOKEN_COVERS))

export function parseEngineTokens(engine: string | undefined): EngineToken[] {
  if (!engine || !engine.trim()) return []
  return engine
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is EngineToken => KNOWN_TOKENS.has(t))
}

/** Empty / missing engine → eligible for every game. */
export function engineMatches(engine: string | undefined, game: SelectedGame): boolean {
  const tokens = parseEngineTokens(engine)
  if (tokens.length === 0) return true
  return tokens.some((token) => TOKEN_COVERS[token].includes(game))
}
