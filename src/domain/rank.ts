import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/**
 * Lexicographic rank (fractional indexing). Inserting a card between two
 * others never reindexes the column: we compute a key strictly between the
 * two neighbors. Comparison = plain `<` on strings.
 */

/** Names a bound in an error message (`null` = the column's edge). */
function boundLabel(rank: string | null, edge: 'start' | 'end'): string {
  return rank === null ? `the ${edge} of the column` : `rank "${rank}"`
}

/** Key strictly between `a` and `b` (`null` bounds = start/end of column). */
export function rankBetween(a: string | null, b: string | null): string {
  try {
    return generateKeyBetween(a, b)
  } catch (cause) {
    // fractional-indexing reports unusable bounds as `<a> >= <b>`, which is
    // the bare string " >= " when both ranks are equal — this message is what
    // an agent reads back from MCP, so it has to say what happened.
    throw new Error(
      `Cannot rank between ${boundLabel(a, 'start')} and ${boundLabel(b, 'end')}: ` +
        'the two neighbours must have distinct, ascending order keys ' +
        '(duplicate ranks usually come from a git merge — reorder the column to repair it)',
      { cause },
    )
  }
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
