import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/**
 * Lexicographic rank (fractional indexing). Inserting a card between two
 * others never reindexes the column: we compute a key strictly between the
 * two neighbors. Comparison = plain `<` on strings.
 */

/** Key strictly between `a` and `b` (`null` bounds = start/end of column). */
export function rankBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b)
}

/** Key placed after `a` (end of column if `a` is the last rank). */
export function rankAfter(a: string | null): string {
  return generateKeyBetween(a, null)
}

/** Key placed before `b` (start of column). */
export function rankBefore(b: string | null): string {
  return generateKeyBetween(null, b)
}

/** `n` ordered keys between `a` and `b`. */
export function rankN(a: string | null, b: string | null, n: number): string[] {
  return generateNKeysBetween(a, b, n)
}
