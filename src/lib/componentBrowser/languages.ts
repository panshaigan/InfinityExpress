import type { WeiduLanguageInfo } from '../install/types'

export const TP2_LITERAL_LANGUAGE: WeiduLanguageInfo = {
  index: 0,
  name: 'TP2 literals (no translations)',
}

export function withTp2LiteralLanguageFallback(
  languages: readonly WeiduLanguageInfo[],
): WeiduLanguageInfo[] {
  return languages.length > 0 ? [...languages] : [{ ...TP2_LITERAL_LANGUAGE }]
}
