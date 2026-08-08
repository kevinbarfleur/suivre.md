import { describe, expect, it } from 'vitest'
import { rankAfter, rankBetween, rankN } from './rank'

describe('rank', () => {
  it('successive appends produce increasing keys', () => {
    let last: string | null = null
    const keys: string[] = []
    for (let i = 0; i < 5; i++) {
      last = rankAfter(last)
      keys.push(last)
    }
    expect([...keys].sort()).toEqual(keys)
  })

  it('rankBetween falls strictly between two keys', () => {
    const a = rankAfter(null)
    const b = rankAfter(a)
    const mid = rankBetween(a, b)
    expect(a < mid && mid < b).toBe(true)
  })

  it('rankN returns n ordered keys', () => {
    const keys = rankN(null, null, 4)
    expect(keys).toHaveLength(4)
    expect([...keys].sort()).toEqual(keys)
  })

  it('names both ranks when the neighbours are unusable', () => {
    const a = rankAfter(null)
    expect(() => rankBetween(a, a)).toThrow(/rank "a0" and rank "a0"/)
    expect(() => rankBetween(a, a)).toThrow(/distinct, ascending order keys/)
  })

  it('names the column edge when a bound is null', () => {
    expect(() => rankBetween(null, 'nope!')).toThrow(/the start of the column and rank "nope!"/)
  })
})
