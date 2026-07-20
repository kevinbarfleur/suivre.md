import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/**
 * Rang lexicographique (fractional indexing). Insérer une carte entre deux
 * autres ne réindexe jamais la colonne : on calcule une clé strictement entre
 * les deux voisines. Comparaison = simple `<` sur les chaînes.
 */

/** Clé strictement entre `a` et `b` (bornes `null` = début/fin de colonne). */
export function rankBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b)
}

/** Clé placée après `a` (fin de colonne si `a` est le dernier rang). */
export function rankAfter(a: string | null): string {
  return generateKeyBetween(a, null)
}

/** Clé placée avant `b` (début de colonne). */
export function rankBefore(b: string | null): string {
  return generateKeyBetween(null, b)
}

/** `n` clés ordonnées entre `a` et `b`. */
export function rankN(a: string | null, b: string | null, n: number): string[] {
  return generateNKeysBetween(a, b, n)
}
