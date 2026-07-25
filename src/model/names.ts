import type { NameParts } from './types.ts';

/**
 * Decomposes an instruction name into its parts.
 *
 * This is a faithful port of the XRegExp pattern the old page ran in the
 * browser on every load. It is deliberately unchanged in behaviour: the parts
 * drive the hover-highlight groups, and changing the decomposition silently
 * changes which cells light up together. The difference is that it now runs
 * once at build time instead of ~900 times per page view.
 *
 * Note `pre` is required, so names with no dot (`nop`, `br_table`) do not match
 * at all and fall back to being treated as a bare `mainop`.
 */
const OPCODE_RE = new RegExp(
  '^' +
    '(?<pre>(stringview_)?[a-z0-9]+\\.(atomic\\.)?(rmw[0-9]*\\.)?)' +
    '(?<relaxed>relaxed\\.)?' +
    '(?<mainop>(q15|all_|any_|is_)?[a-z]+)' +
    '(?<opbits>[0-9][0-9x]*)?' +
    '(?<post>_((low_|high_|sat_)?[ixf0-9]+|sat|i32|i64|f32|f64|pairwise|lane))?' +
    '(?<sign>_[su])?' +
    '(?<rest>[0-9a-zA-Z._]*)?',
);

/** Strips leading and trailing dots, underscores and spaces. */
export function trimDot(value: string): string {
  return value.replace(/^[._ ]+/, '').replace(/[._ ]+$/, '');
}

export function chopUp(name: string): NameParts {
  const match = OPCODE_RE.exec(name);
  const g = match?.groups;
  if (!g) return { mainop: name };

  const parts: NameParts = {};
  if (g['pre']) parts.pre = trimDot(g['pre']);
  if (g['relaxed']) parts.relaxed = true;
  if (g['mainop']) parts.mainop = g['mainop'];
  if (g['opbits']) parts.opbits = g['opbits'];
  if (g['post']) parts.post = g['post'].replace(/^_/, '');
  if (g['sign']) parts.sign = g['sign'].replace(/^_/, '') as 's' | 'u';
  // Stripped of its leading underscore like post and sign, so callers can
  // join the three with a single separator. Leaving it on produced
  // `_pairwise__i8x16_s`, a doubled underscore and a stray break opportunity.
  if (g['rest']) parts.rest = g['rest'].replace(/^_/, '');
  return parts;
}

/**
 * Where a long name may wrap.
 *
 * Separators are the natural places: after a dot, before an underscore, so
 * `i64.atomic.rmw16.cmpxchg_u` breaks into `i64.` `atomic.` `rmw16.`
 * `cmpxchg` `_u` rather than being chopped mid-word into `ato` `mic.` and
 * `cmpxch` `g`. Every part stays a part.
 *
 * A handful of long words contain no separator at all, so they carry an
 * explicit split.
 */
const IN_WORD: readonly (readonly [string, string])[] = [
  ['laneselect', 'lane<wbr>select'],
  ['unreachable', 'unreach<wbr>able'],
  ['externalize', 'external<wbr>ize'],
  ['internalize', 'internal<wbr>ize'],
  // Both are wider than a grid cell on their own, so they will be broken
  // whatever happens. Better at the seam in the word than two letters from
  // the end.
  ['reinterpret', 're<wbr>interpret'],
  ['pairwise', 'pair<wbr>wise'],
];

/** Inserts `<wbr>` hints into an already-escaped name fragment. */
export function addWordBreaks(escaped: string): string {
  let out = escaped.replace(/\./g, '.<wbr>').replace(/_/g, '<wbr>_');
  for (const [from, to] of IN_WORD) out = out.split(from).join(to);
  return out;
}
