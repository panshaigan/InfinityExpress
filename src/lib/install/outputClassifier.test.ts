import { describe, expect, it } from 'vitest'
import { classifyWeiduOutputLine } from './outputClassifier'

describe('classifyWeiduOutputLine', () => {
  it('detects errors', () => {
    expect(classifyWeiduOutputLine('ERROR: something failed')).toBe('error')
  })
  it('detects input prompts', () => {
    expect(classifyWeiduOutputLine('Do you want to continue?')).toBe('inputRequired')
  })
  it('detects success phrases', () => {
    expect(classifyWeiduOutputLine('Successfully installed')).toBe('finished')
  })
})
