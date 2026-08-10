import { describe, expect, it } from 'vitest'
import {
  authorFromModUrl,
  joinGameTokens,
  modMatchesGameFilter,
  splitAuthorNames,
  splitGameTokens,
  withHtmlPreviewIfNeeded,
} from './modFieldParse'

describe('splitGameTokens / joinGameTokens', () => {
  it('splits hyphenated game fields', () => {
    expect(splitGameTokens('BG1-BG2-IWD')).toEqual(['BG1', 'BG2', 'IWD'])
  })

  it('joins tokens in canonical order', () => {
    expect(joinGameTokens(['IWD', 'BG1', 'BG2'])).toBe('BG1-BG2-IWD')
    expect(joinGameTokens(['BG2', 'BG1'])).toBe('BG1-BG2')
    expect(joinGameTokens([])).toBe('')
  })

  it('drops unknown tokens', () => {
    expect(joinGameTokens(['BG1', 'B2', 'PST'])).toBe('BG1-PST')
  })
})

describe('modMatchesGameFilter', () => {
  it('matches individual game tokens inside compound fields', () => {
    expect(modMatchesGameFilter('BG1-BG2-IWD', 'BG1')).toBe(true)
    expect(modMatchesGameFilter('BG1-BG2-IWD', 'IWD')).toBe(true)
    expect(modMatchesGameFilter('BG1-BG2-IWD', 'PST')).toBe(false)
    expect(modMatchesGameFilter('BG2', 'BG1')).toBe(false)
  })

  it('matches BG1+BG2 as the union of BG1 and BG2', () => {
    expect(modMatchesGameFilter('BG1-BG2', 'BG1+BG2')).toBe(true)
    expect(modMatchesGameFilter('BG1-BG2-IWD-PST', 'BG1+BG2')).toBe(true)
    expect(modMatchesGameFilter('BG1', 'BG1+BG2')).toBe(true)
    expect(modMatchesGameFilter('BG2', 'BG1+BG2')).toBe(true)
    expect(modMatchesGameFilter('IWD', 'BG1+BG2')).toBe(false)
    expect(modMatchesGameFilter('PST', 'BG1+BG2')).toBe(false)
  })
})

describe('splitAuthorNames', () => {
  it('splits comma-separated authors', () => {
    expect(splitAuthorNames('Lava, Kaeloree, TheArtisan')).toEqual([
      'Lava',
      'Kaeloree',
      'TheArtisan',
    ])
    expect(splitAuthorNames('Israel Blargh,vanatos, T.C Dale')).toEqual([
      'Israel Blargh',
      'vanatos',
      'T.C Dale',
    ])
  })
})

describe('authorFromModUrl', () => {
  it('maps known download hosts to catalog authors', () => {
    expect(
      authorFromModUrl('https://downloads.weaselmods.net/download/gahesh'),
    ).toBe('Lava')
    expect(authorFromModUrl('https://www.morpheus-mart.com/crucible')).toBe(
      'Morpheus562',
    )
  })

  it('returns null for other hosts', () => {
    expect(authorFromModUrl('https://github.com/org/repo')).toBeNull()
    expect(authorFromModUrl('not-a-url')).toBeNull()
  })
})

describe('withHtmlPreviewIfNeeded', () => {
  const rawHtml =
    'https://raw.githubusercontent.com/Spellhold-Studios/Baldurs-Gate-Graphical-Overhaul/master/bggo/readme/README.html'
  const previewed = `https://htmlpreview.github.io/?${rawHtml}`

  it('prefixes raw github html readmes', () => {
    expect(withHtmlPreviewIfNeeded(rawHtml)).toBe(previewed)
  })

  it('is idempotent for already-previewed urls', () => {
    expect(withHtmlPreviewIfNeeded(previewed)).toBe(previewed)
  })

  it('leaves non-html raw urls and other hosts alone', () => {
    const rawTxt =
      'https://raw.githubusercontent.com/owner/repo/main/readme.txt'
    expect(withHtmlPreviewIfNeeded(rawTxt)).toBe(rawTxt)
    expect(
      withHtmlPreviewIfNeeded('https://spellhold-studios.github.io/readme.html'),
    ).toBe('https://spellhold-studios.github.io/readme.html')
  })
})
