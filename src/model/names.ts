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
  // Fits a grid cell by less than a pixel, so it drops its last letter at the
  // slightest provocation. Compare-and-exchange, so this is the seam.
  ['cmpxchg', 'cmp<wbr>xchg'],
];

/** Inserts `<wbr>` hints into an already-escaped name fragment. */
export function addWordBreaks(escaped: string): string {
  let out = escaped.replace(/\./g, '.<wbr>').replace(/_/g, '<wbr>_');
  for (const [from, to] of IN_WORD) out = out.split(from).join(to);
  return out;
}

/**
 * One piece of a name, as it is drawn and as it is matched.
 *
 * A name is a sentence about an instruction — a type, an operation, a width, a
 * source type, a signedness — and each of those is worth asking "what else has
 * this?" about. So each becomes its own span, and hovering one relates by that
 * piece alone rather than by the whole cell.
 */
export interface NameToken {
  /** Text as drawn, including the separator that introduces it. */
  text: string;
  /** What it matches on. Bare, so `f64` as a type and `f64` as a source type
   *  are the same thing — which is what a reader hovering it means. */
  token: string;
  /** Structural role, which decides weight and where a line may break. */
  role: 'pre' | 'op' | 'post';
  /** First of its role, so it carries the forced line break in the grid. */
  first: boolean;
}

/** Words that qualify an operation rather than describing its operands. */
export const OP_QUALIFIERS = new Set(['pairwise', 'sat', 'low', 'high', 'zero', 'lane']);

export function tokenise(parts: NameParts | undefined, name: string): NameToken[] {
  const out: NameToken[] = [];
  const push = (text: string, token: string, role: NameToken['role']) => {
    out.push({ text, token, role, first: !out.some((t) => t.role === role) });
  };

  if (!parts?.mainop && !parts?.pre) {
    push(name, name, 'op');
    return out;
  }

  // `i32.atomic.rmw16.` is three separate facts, so it is three spans.
  for (const segment of (parts.pre ?? '').split('.').filter(Boolean)) {
    push(`${segment}.`, segment, 'pre');
  }
  if (parts.relaxed) push('relaxed.', 'relaxed', 'pre');

  if (parts.mainop) push(parts.mainop, parts.mainop, 'op');
  // The width in `load16` is its own fact: every 16-bit access shares it.
  if (parts.opbits) push(parts.opbits, parts.opbits, 'op');

  const postWords = (parts.post ?? '').split('_').filter(Boolean);
  while (postWords.length && OP_QUALIFIERS.has(postWords[0]!)) {
    const word = postWords.shift()!;
    push(`_${word}`, word, 'op');
  }
  for (const word of postWords) push(`_${word}`, word, 'post');
  if (parts.sign) push(`_${parts.sign}`, parts.sign, 'post');
  for (const word of (parts.rest ?? '').split('_').filter(Boolean)) {
    push(`_${word}`, word, 'post');
  }

  /*
   * The decomposition is reassembled and checked against the name it came from.
   * It is written by hand in data/, and where it is wrong the pieces do not add
   * up to the name — `v128.load32_splat` decomposed as sign `s` plus `plat` was
   * being drawn as `v128.load32_s_plat`, an instruction that does not exist,
   * and `ref.test null` simply lost its `null`. Falling back to one token draws
   * the name the data actually gives; only the hover granularity is lost, and
   * that is the right way round.
   */
  if (out.map((t) => t.text).join('') !== name) {
    return [{ text: name, token: name, role: 'op', first: true }];
  }

  return out;
}
