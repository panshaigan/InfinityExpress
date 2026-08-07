import { describe, expect, it } from 'vitest'
import { isHttpUrl } from './url'

describe('isHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isHttpUrl('https://example.com/readme')).toBe(true)
    expect(isHttpUrl('http://example.com/readme')).toBe(true)
    expect(isHttpUrl('  https://example.com/path?q=1  ')).toBe(true)
  })

  it('rejects empty, placeholder, relative, and non-http schemes', () => {
    expect(isHttpUrl(undefined)).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl('   ')).toBe(false)
    expect(isHttpUrl('-')).toBe(false)
    expect(isHttpUrl('/relative/path')).toBe(false)
    expect(isHttpUrl('example.com/readme')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('ftp://example.com/file')).toBe(false)
  })
})
