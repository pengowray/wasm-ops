/**
 * Ranking a search.
 *
 * Search used to be a sieve: every instruction either matched or did not, and
 * the chart kept the ones that did. That is the right answer for `i64 load`
 * and the wrong one for `11`, where the reader has a byte in front of them and
 * wants to know what it is. `11` is 0x11 as a hex byte, 17 as a decimal one,
 * the second byte of a hundred LEB128 encodings, and a substring of `i32x4`
 * and of half the sub-opcodes in the SIMD table — all matches, and only the
 * first is what was meant.
 *
 * So matches are scored rather than merely counted, and the scores encode what
 * a query is most likely to have meant:
 *
 * - A name you typed in full beats a name that contains what you typed.
 * - A number read as an opcode beats the same number read as a substring.
 * - Hex beats decimal, because this is a page about bytes and `11` written on
 *   a byte is 0x11 far more often than it is eleven.
 * - The first byte of an encoding beats the rest of it. The `01` in `FD 01` is
 *   the tail of a LEB128 value and is not something anyone searches for; it
 *   scores, so that a reader staring at a byte dump can still find it, but it
 *   scores below everything else.
 * - A property beats prose, and prose comes last: it is the longest text and
 *   the least specific, and a word in a description is the weakest evidence
 *   that this is the instruction you wanted.
 *
 * The scores are spread widely on purpose. Two hits a few points apart are
 * indistinguishable to a reader; the point of the numbers is the order, and
 * order is easiest to reason about when each kind of match sits in its own
 * band.
 */

import type { Opcode } from './types.ts';
import { toHex } from './types.ts';
import { normaliseTag } from './search.ts';

/** One instruction that matched, and why. */
export interface SearchHit {
  op: Opcode;
  score: number;
  /**
   * What made it match, where that is not the name — `dec:17`, `FD 87 02`,
   * `tag: Arithmetic`. Shown beside the result so the reader can see why a
   * line they did not type is in the list.
   */
  note?: string;
  /** The run of `op.name` that matched, for marking it in the result. */
  span?: [number, number];
}

/** Bands, widely spaced. See the note above. */
const SCORE = {
  nameExact: 1000,
  encodingFull: 950,
  nameStart: 900,
  byteHex: 880,
  subDecimal: 860,
  nameSegment: 800,
  byteDecimal: 820,
  subHex: 700,
  nameContains: 520,
  tagExact: 460,
  tagContains: 300,
  prefixByte: 250,
  summary: 220,
  prose: 120,
  encodingTail: 40,
} as const;

/** What a term is measured against, worked out once per instruction. */
export interface Haystacks {
  name: string;
  /**
   * Each property in both the spellings it has — the token used as a selector
   * and the label the chip is drawn with — each carrying the label, so that a
   * match on `sub-arithmetic` can be reported as "Arithmetic".
   */
  tags: { match: string; label: string }[];
  summary: string;
  prose: string;
}

/** A byte as the page writes one: two uppercase hex digits. */
function hexByte(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

/** `looks like a number` — in either base, with or without the 0x. */
const NUMERIC = /^(?:0x)?[0-9a-f]+$/i;
const DECIMAL = /^[0-9]+$/;

/**
 * Where a name's parts begin: the start, and just after each separator. A
 * query matching there is matching a whole part of the name rather than
 * landing in the middle of one, which is a much better guess at intent —
 * `load` in `i64.load16_u` against `oad` in the same.
 */
function segmentStarts(name: string): number[] {
  const starts = [0];
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '.' || name[i] === '_' || name[i] === ' ') starts.push(i + 1);
  }
  return starts;
}

interface Scored {
  score: number;
  note?: string;
  span?: [number, number];
}

const NO_MATCH: Scored = { score: 0 };

/** The best reading of one term against one instruction. */
function scoreTerm(term: string, op: Opcode, hay: Haystacks): Scored {
  const tagged = /^(?:tag|is):(.+)$/.exec(term);
  if (tagged) {
    const wanted = normaliseTag(tagged[1]!);
    const hit = hay.tags.find((tag) => tag.match.startsWith(wanted));
    return hit ? { score: SCORE.tagExact, note: `tag: ${hit.label}` } : NO_MATCH;
  }

  let best: Scored = NO_MATCH;
  const take = (candidate: Scored): void => {
    if (candidate.score > best.score) best = candidate;
  };

  // --- the name ------------------------------------------------------------
  if (hay.name) {
    const at = hay.name.indexOf(term);
    if (hay.name === term) {
      take({ score: SCORE.nameExact, span: [0, term.length] });
    } else if (at === 0) {
      take({ score: SCORE.nameStart, span: [0, term.length] });
    } else if (at > 0) {
      const segment = segmentStarts(hay.name).includes(at);
      take({
        score: segment ? SCORE.nameSegment : SCORE.nameContains,
        span: [at, at + term.length],
      });
    }
  }

  // --- the opcode ----------------------------------------------------------
  if (NUMERIC.test(term)) {
    const digits = term.replace(/^0x/i, '').toUpperCase();
    const bytes = op.bytes.map(hexByte);

    // The whole encoding, however it was spelled: `FD8702`, `fd 87 02`, with
    // or without the 0x. Spaces are already gone — the query was split on
    // them, and a run of terms that reassembles into an encoding is handled by
    // the caller.
    if (digits.length > 2 && digits === bytes.join('')) {
      take({ score: SCORE.encodingFull, note: bytes.join(' ') });
    }

    if (!op.prefix) {
      if (digits === bytes[0]) take({ score: SCORE.byteHex, note: `0x${bytes[0]}` });
      if (DECIMAL.test(term) && Number(term) === op.code) {
        take({ score: SCORE.byteDecimal, note: `dec:${op.code}` });
      }
    } else {
      // The spec writes a prefixed instruction as `0xFD 263:u32`, so the
      // decimal sub-opcode is the form to favour — it is what this page shows
      // in every cell and what the specification itself uses.
      if (DECIMAL.test(term) && Number(term) === op.code) {
        take({ score: SCORE.subDecimal, note: `0x${op.prefix} ${op.code}` });
      }
      if (digits === toHex(op.code)) {
        take({ score: SCORE.subHex, note: `0x${op.prefix} 0x${toHex(op.code)}` });
      }
      if (digits === op.prefix) take({ score: SCORE.prefixByte, note: `0x${op.prefix} table` });
    }

    // Any other byte of the encoding. This is the `01` case: the tail of a
    // LEB128 value, which nobody searches for on purpose but which someone
    // reading a byte dump may well type. Findable, and last.
    if (best.score < SCORE.encodingTail && bytes.slice(1).includes(digits)) {
      take({ score: SCORE.encodingTail, note: bytes.join(' ') });
    }
  }

  // --- properties, summary, prose ------------------------------------------
  if (best.score < SCORE.tagContains) {
    // Exact before partial, so `arithmetic` reports the property it names
    // rather than the first one that happens to contain the word.
    const tag =
      hay.tags.find((t) => t.match === term) ?? hay.tags.find((t) => t.match.includes(term));
    if (tag) take({ score: SCORE.tagContains, note: `tag: ${tag.label}` });
  }
  if (best.score < SCORE.summary && hay.summary.includes(term)) {
    take({ score: SCORE.summary });
  }
  if (best.score < SCORE.prose && hay.prose.includes(term)) {
    take({ score: SCORE.prose });
  }

  return best;
}

/**
 * Every instruction matching every term, best first.
 *
 * All terms must match, as they did before — whitespace is still the only
 * operator — but the query is also tried as a single run first, so that
 * `fd 87 02` finds the instruction those three bytes encode rather than the
 * instructions that contain all three of them separately.
 */
export function rank(
  query: string,
  ops: Opcode[],
  haystacks: (op: Opcode) => Haystacks,
): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  /*
   * `FD 87 02` and `FD8702` are the same question, so an all-numeric query is
   * also tried as one run — and tried whether or not the terms matched
   * separately, because they usually do and badly. Every byte of `FD 87 02`
   * appears somewhere in the encoding of dozens of vector instructions, so
   * read term by term the query matches most of the SIMD table weakly, and the
   * one instruction those three bytes actually encode was buried in it.
   */
  const joined = terms.length > 1 && terms.every((t) => NUMERIC.test(t))
    ? terms.join('').replace(/0x/gi, '')
    : null;

  const hits: SearchHit[] = [];
  for (const op of ops) {
    if (!op.name) continue;
    const hay = haystacks(op);

    let total = 0;
    let best: Scored = NO_MATCH;
    let matched = true;
    for (const term of terms) {
      const scored = scoreTerm(term, op, hay);
      if (!scored.score) {
        matched = false;
        break;
      }
      total += scored.score;
      if (scored.score > best.score) best = scored;
    }
    // Averaged over the terms, so a two-word query is comparable with a
    // one-word one and a long query does not simply out-score a short.
    let score = matched ? total / terms.length : 0;

    if (joined) {
      const whole = scoreTerm(joined, op, hay);
      if (whole.score > score) {
        matched = true;
        score = whole.score;
        best = whole;
      }
    }
    if (!matched) continue;

    hits.push({
      op,
      score,
      ...(best.note ? { note: best.note } : {}),
      ...(best.span ? { span: best.span } : {}),
    });
  }

  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      (a.op.name?.length ?? 0) - (b.op.name?.length ?? 0) ||
      a.op.bytes.length - b.op.bytes.length ||
      a.op.code - b.op.code,
  );
}
