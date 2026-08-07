import { diffSelectedIds } from './diffSelectedIds'

describe('diffSelectedIds', () => {
  it('reports added and removed counts', () => {
    expect(
      diffSelectedIds(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd', 'e'])),
    ).toEqual({ added: 2, removed: 1 })
  })

  it('reports zero when unchanged', () => {
    expect(diffSelectedIds(new Set(['a']), new Set(['a']))).toEqual({
      added: 0,
      removed: 0,
    })
  })
})
