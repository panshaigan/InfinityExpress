import { describe, expect, it } from 'vitest'
import {
  TP2_LITERAL_LANGUAGE,
  withTp2LiteralLanguageFallback,
} from './languages'

describe('component browser languages', () => {
  it('keeps languages reported by WeiDU', () => {
    const languages = [{ index: 2, name: 'English' }]
    expect(withTp2LiteralLanguageFallback(languages)).toEqual(languages)
  })

  it('uses language index zero for a TP2 with literal strings only', () => {
    expect(withTp2LiteralLanguageFallback([])).toEqual([TP2_LITERAL_LANGUAGE])
  })
})
