/**
 * What an instruction can be found by.
 *
 * Search here is a filter, not a ranked result list: the chart is the answer,
 * so a query removes what does not match and leaves everything else where it
 * was. In the byte grid the non-matching cells stay as empty slots, because a
 * cell's position is its opcode and a grid that closes up its gaps has stopped
 * being a grid.
 *
 * The text an instruction is matched against is assembled from everything the
 * page already knows about it — its name, its opcode in every spelling on the
 * page, its summary, its category and its property tags. The client adds the
 * written description, which it reads out of the page rather than shipping a
 * second copy of.
 */

import type { Opcode } from './types.ts';
import { toHex } from './types.ts';
import { CATEGORY_LABELS, categorize, subcategorize } from './categories.ts';
import { proposal } from './proposals.ts';
import { summarize } from './summary.ts';
import { tagsFor } from './tags.ts';

/** A compiled search term. */
export type Term = string | RegExp;

/** `12`, `0xfd`, `0x28` — a term that names a number rather than spells a word. */
const NUMERIC = /^(0x[0-9a-f]+|[0-9]+)$/;

/**
 * Splits a query into terms, all of which must match.
 *
 * Words are plain substrings, so `ext` finds `extend`, `extract` and `extmul`,
 * and whitespace is the only operator: `i64 load` finds the i64 loads without
 * the reader having to know whether the name has a dot, an underscore or
 * nothing between them.
 *
 * Numbers are matched whole. Searching `0xFD 12` for a sub-opcode should not
 * also return everything containing 12 somewhere — `0xFD 120`, `i32x4` — which
 * as a substring is most of the SIMD table.
 */
export function compileQuery(query: string): Term[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) =>
      NUMERIC.test(term)
        ? new RegExp(`(?:^|[^0-9a-z])${term.replace('.', '\\.')}(?![0-9a-z])`)
        : term,
    );
}

export function matchesQuery(haystack: string, terms: Term[]): boolean {
  return terms.every((term) =>
    typeof term === 'string' ? haystack.includes(term) : term.test(haystack),
  );
}

/**
 * Everything about an instruction that is derived rather than written, as one
 * lowercase string.
 *
 * The opcode goes in three ways — `0x28`, `28` and `40` — because the page
 * itself shows it in more than one, and a reader searching for a byte they saw
 * in a hex dump should not have to know which spelling this page favours.
 */
export function searchTextFor(op: Opcode): string {
  const bits: string[] = [];
  if (op.name) bits.push(op.name);
  if (op.displayName) bits.push(op.displayName.replace(/<[^>]+>/g, ''));

  bits.push(op.id);
  if (op.prefix) {
    bits.push(`0x${op.prefix} ${op.code}`, `0x${op.prefix} ${toHex(op.code)}`);
  } else {
    bits.push(`0x${toHex(op.code)}`, String(op.code));
  }

  if (!op.name) {
    // Unassigned slots are worth finding by what they are.
    bits.push('unassigned reserved');
    return bits.join(' ').toLowerCase();
  }

  const summary = summarize(op);
  if (summary) bits.push(summary);
  if (op.immediateArgs) bits.push(op.immediateArgs.replace(/<[^>]+>/g, ' '));

  bits.push(CATEGORY_LABELS[categorize(op)]);
  const sub = subcategorize(op);
  if (sub) bits.push(sub.label);
  for (const tag of tagsFor(op)) bits.push(tag.label);

  const from = proposal(op.proposal);
  if (from) bits.push(from.name, from.id);
  if (op.status !== 'standard') bits.push(op.status);

  return bits.join(' ').toLowerCase();
}
