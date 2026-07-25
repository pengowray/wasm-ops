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
 * Points at which a long name may wrap. The old page hard-coded these as
 * `<wbr>` insertions during rendering; they are name knowledge, so they live
 * here and the renderer just applies them.
 */
const BREAK_AFTER = [
  'atomic.rmw',
  'memory.atomic',
  'stringview_iter',
  'return_call',
  'call_indirect',
  'br_on_',
];

/** Inserts `<wbr>` hints into an already-escaped name fragment. */
export function addWordBreaks(escaped: string): string {
  let out = escaped;
  for (const token of BREAK_AFTER) {
    // Break before the final segment of the token, matching the old output.
    const idx = token.lastIndexOf('_') > token.lastIndexOf('.')
      ? token.lastIndexOf('_')
      : token.lastIndexOf('.');
    const replacement = token.slice(0, idx + 1) + '<wbr>' + token.slice(idx + 1);
    out = out.split(token).join(replacement);
  }
  // Whole-word splits that have no separator to hang off.
  for (const [from, to] of [
    ['laneselect', 'lane<wbr>select'],
    ['unreachable', 'unreach<wbr>able'],
    ['externalize', 'external<wbr>ize'],
    ['internalize', 'internal<wbr>ize'],
  ] as const) {
    out = out.split(from).join(to);
  }
  return out;
}
