import { describe, expect, it } from 'vitest'
import { rankAfter, rankBetween, rankN } from './rank'

describe('rank', () => {
  it('les ajouts successifs produisent des clés croissantes', () => {
    let last: string | null = null
    const keys: string[] = []
    for (let i = 0; i < 5; i++) {
      last = rankAfter(last)
      keys.push(last)
    }
    expect([...keys].sort()).toEqual(keys)
  })

  it('rankBetween tombe strictement entre deux clés', () => {
    const a = rankAfter(null)
    const b = rankAfter(a)
    const mid = rankBetween(a, b)
    expect(a < mid && mid < b).toBe(true)
  })

  it('rankN renvoie n clés ordonnées', () => {
    const keys = rankN(null, null, 4)
    expect(keys).toHaveLength(4)
    expect([...keys].sort()).toEqual(keys)
  })
})
