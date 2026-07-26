/**
 * How a property is spelled when it is being searched for.
 *
 * This file used to hold the whole search: a query compiled to terms, every
 * term matched against one long string of everything known about an
 * instruction, and a yes or no. Ranking replaced it (see `rank.ts`), which
 * needs to know *which* text answered and so cannot use a single string. What
 * is left is the one thing both versions need — the single spelling of a tag,
 * so that `Vector (SIMD)`, `vector-simd` and what the reader types are the
 * same word.
 */

/** One spelling for a tag, so `Vector (SIMD)` and `vector-simd` are the same. */
export function normaliseTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
