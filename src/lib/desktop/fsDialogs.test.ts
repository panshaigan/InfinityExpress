import { describe, expect, it } from 'vitest'
import { normalizeFolderPath } from './fsDialogs'

describe('normalizeFolderPath', () => {
  it('preserves case and the root for POSIX paths', () => {
    expect(normalizeFolderPath(' /games/BG/ ')).toBe('/games/BG')
    expect(normalizeFolderPath('/games/BG')).not.toBe(normalizeFolderPath('/games/bg'))
    expect(normalizeFolderPath('/')).toBe('/')
    expect(normalizeFolderPath('')).toBe('')
  })

  it('normalizes Windows separators and case', () => {
    expect(normalizeFolderPath(' D:\\Games\\BG\\ ')).toBe('d:/games/bg')
    expect(normalizeFolderPath('D:/Games/BG/')).toBe('d:/games/bg')
    expect(normalizeFolderPath('\\\\Server\\Share\\BG\\')).toBe('//server/share/bg')
  })
})
