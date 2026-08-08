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
})
