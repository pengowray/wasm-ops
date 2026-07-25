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
export type Term =
  /** A word, matched anywhere in the text. */
  | { kind: 'text'; value: string }
  /** A number, matched whole. */
  | { kind: 'text'; value: string; whole: RegExp }
  /** `tag:signed` — matched against the property tags alone. */
  | { kind: 'tag'; value: string };

/** What a search is matched against. */
export interface Haystack {
  text: string;
  /** Tag ids and labels, normalised — `signed`, `stack-manipulation`. */
  tags: string[];
}

/** `12`, `0xfd`, `0x28` — a term that names a number rather than spells a word. */
const NUMERIC = /^(0x[0-9a-f]+|[0-9]+)$/;

/** One spelling for a tag, so `Vector (SIMD)` and `vector-simd` are the same. */
export function normaliseTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
 *
 * `tag:` narrows to the property tags, where the plain form cannot: `signed`
 * as a word appears in the prose of half the instructions on the page and in
 * the middle of `unsigned`, while `tag:signed` is exactly the 111 instructions
 * carrying that property — the same set clicking the chip lights up.
 */
export function compileQuery(query: string): Term[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term): Term => {
      const tag = /^(?:tag|is):(.+)$/.exec(term);
      if (tag) return { kind: 'tag', value: normaliseTag(tag[1]!) };
      if (NUMERIC.test(term)) {
        return {
          kind: 'text',
          value: term,
          whole: new RegExp(`(?:^|[^0-9a-z])${term}(?![0-9a-z])`),
        };
      }
      return { kind: 'text', value: term };
    });
}

export function matchesQuery(haystack: Haystack, terms: Term[]): boolean {
  return terms.every((term) => {
    if (term.kind === 'tag') {
      // A prefix, so `tag:load` finds the Loads group without the reader
      // having to know whether the label is singular or plural.
      return haystack.tags.some((tag) => tag.startsWith(term.value));
    }
    return 'whole' in term ? term.whole.test(haystack.text) : haystack.text.includes(term.value);
  });
}

/**
 * Everything about an instruction that is derived rather than written, as one
 * lowercase string.
 *
 * The opcode goes in three ways — `0x28`, `28` and `40` — because the page
 * itself shows it in more than one, and a reader searching for a byte they saw
 * in a hex dump should not have to know which spelling this page favours.
 */
/**
 * The tags an instruction can be found by, each in both spellings it has: the
 * token used as a selector, and the label the chip is drawn with.
 */
export function searchTagsFor(op: Opcode): string[] {
  const tags = new Set<string>();
  for (const tag of tagsFor(op)) {
    tags.add(normaliseTag(tag.id));
    tags.add(normaliseTag(tag.label));
  }
  return [...tags];
}

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
