/**
 * The opcode model, shared by the static-site generator and the browser client.
 *
 * The old page encoded all of this implicitly: an opcode's byte value came from
 * its cell's position in a hand-written table, and its groupings came from a
 * regex run over the cell text at page load. Both are now explicit and typed.
 */

/**
 * One id per table. The five are lettered A to E on the page; the ids stay as
 * they are because they are in live URLs and in the section filter.
 */
export type SectionId = 'core' | 'gc' | 'fc' | 'simd' | 'threads';

export interface Section {
  id: SectionId;
  /** Heading text, without the mark. */
  title: string;
  /**
   * The one character a table is recognised by: its letter, or `0` for the
   * table of single-byte opcodes.
   *
   * It was an emoji per table — ⭕, ⭐, 🌀, 🧵 — chosen when the tables were
   * named after proposals and there was nothing in a name to abbreviate. Now
   * that they are lettered, the letter is the abbreviation, and it says which
   * table rather than merely standing for one. It is also the same character in
   * every font, which no emoji is.
   */
  mark?: string;
  /**
   * The heading's HTML id. Kept as whatever the page has always used, because
   * those anchors are linked from inside the chart and from outside the site.
   */
  anchor: string;
  /** Prefix byte as uppercase hex, e.g. "FB". Empty for single-byte opcodes. */
  prefix: string;
  /** Sub-opcode value of the first cell of this section's 16-wide grid. */
  start: number;
  /** Number of cells the original table laid out. */
  count: number;
  /** Introductory prose (HTML) shown under the heading. */
  intro?: string;
}

/**
 * Where an instruction sits in its lifecycle.
 *
 * - `standard`   in the specification
 * - `proposal`   an active proposal, not yet standardised
 * - `legacy`     superseded, but still emitted and accepted in practice — the
 *                pre-`try_table` exception handling instructions
 * - `dormant`    a proposal that has stalled — no engine implements it and the
 *                encoding may still change. Not withdrawn, but not something
 *                to write code against either
 * - `withdrawn`  an encoding that was used during a proposal's development and
 *                then abandoned. The slot is unassigned today; this records
 *                what a reader may find in an old module or an old tool
 * - `reserved`   unassigned, nothing was ever here
 *
 * The middle three are not what a byte means today, so the chart hides them
 * unless asked.
 */
export type OpcodeStatus =
  | 'standard'
  | 'proposal'
  | 'legacy'
  | 'dormant'
  | 'withdrawn'
  | 'reserved';

/** Statuses that are not what a byte means today. */
export const HISTORICAL: readonly OpcodeStatus[] = ['legacy', 'dormant', 'withdrawn'];

/**
 * A structured decomposition of an opcode name, e.g. `i64.load16_u` becomes
 * `{ pre: 'i64', mainop: 'load', opbits: '16', sign: 'u' }`. Drives the
 * hover-highlight groups and the "group by" orderings.
 */
export interface NameParts {
  /** Before the dot: `i32`, `memory`, `i32.atomic.rmw16`, `stringview_iter`. */
  pre?: string;
  /** The `relaxed.` infix of relaxed-SIMD instructions. */
  relaxed?: boolean;
  /** The operation itself: `load`, `br_table`, `convert`, `all_true`. */
  mainop?: string;
  /** Bit width suffix attached to the op: `8` in `load8`, `16x4` in `load16x4`. */
  opbits?: string;
  /** Trailing type or modifier: `f32` in `f64.promote_f32`, `sat`, `pairwise`. */
  post?: string;
  /** Signedness: `s` or `u`. */
  sign?: 's' | 'u';
  /** Anything the decomposition did not consume. */
  rest?: string;
}

export interface StackSignature {
  /** The `[t1*] → [t2*]` markup, kept as HTML for its sups and subs. */
  html: string;
  /** The old page rendered some signatures at a larger size. */
  large?: boolean;
  /** Commentary that sat alongside the signature, e.g. "(value-polymorphic)". */
  note?: string;
}

export interface Opcode {
  /**
   * Canonical id, and the anchor used in URLs: `0x00`, `0xFB.128`, `0xFD.256`.
   *
   * Follows the specification's notation — prefix in hex, sub-opcode in decimal
   * — with a dot for the separator so it survives a URL. The old form
   * concatenated the two into `0xFD100`, which reads as a run of bytes and is
   * not one: that instruction encodes as FD 80 02.
   */
  id: string;
  section: SectionId;
  /** Prefix byte as uppercase hex, e.g. "FD". Empty for core opcodes. */
  prefix: string;
  /** The sub-opcode value. For core opcodes this is the whole byte. */
  code: number;
  /** Full encoding: the prefix byte (if any) followed by LEB128 of `code`. */
  bytes: number[];
  /** Instruction name, or null for an unassigned slot. */
  name: string | null;
  status: OpcodeStatus;
  /** Named proposal this instruction belongs to, when known. */
  proposal?: string;
  /** For `legacy` and `withdrawn`: what replaced it, and where it went. */
  supersededBy?: string;
  parts?: NameParts;
  /** Immediate operands, shown beside the name: `[t?]`, `x`. HTML. */
  immediateArgs?: string;
  /** What follows the opcode in the byte stream. HTML. */
  followedBy?: string;
  stack?: StackSignature;
  /** Descriptive prose. HTML. */
  description?: string;
  /**
   * A cell that is not an instruction but a doorway: one of the four bytes in
   * the core table that introduce a sub-table, listing the sections it opens.
   *
   * What such a cell says about itself — the range of sub-opcodes behind it,
   * how many are assigned, which proposals they came from — is all derivable
   * from those sections, so it is generated at load time rather than written
   * out by hand and left to go stale the next time a proposal lands.
   */
  prefixFor?: SectionId[];
  /**
   * A cell whose content is a link rather than an instruction — the four
   * prefix bytes in the core table that jump to their sub-tables.
   */
  linkTo?: { label: string; href: string }[];
  /** Display name override, used by the prefix-byte cells. HTML. */
  displayName?: string;
}

export interface OpcodeData {
  sections: Section[];
  opcodes: Opcode[];
}

/**
 * A table's mark, drawn: the character reversed out of a filled square.
 *
 * Inverted rather than set as a plain letter because it appears beside running
 * text — in a heading, in a filter's label, on the line a doorway byte says
 * where it leads — and a bare `B` there is a word of the sentence. A block of
 * ink with a letter knocked out of it is a symbol, which is what it stands in
 * for and what an emoji was doing in the same places.
 *
 * Sized in `em`, so it takes the scale of whatever it is set beside rather than
 * needing one rule per place it appears.
 */
export function tableMark(mark: string | undefined): string {
  if (!mark) return '';
  return `<span class="table-mark" aria-hidden="true">${mark}</span>`;
}

/** LEB128-encode an unsigned integer. */
export function leb128(value: number): number[] {
  if (value < 0 || !Number.isInteger(value)) {
    throw new RangeError(`not an unsigned integer: ${value}`);
  }
  const out: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

/**
 * Uppercase hex, padded to at least two digits — and no further. Wider values
 * keep their natural width, so 0x100 stays `100`. This is what the old page
 * did, and the ids it produces (`0xFD100`) are live anchors, so it stays.
 */
export function toHex(value: number): string {
  const hex = value.toString(16).toUpperCase();
  return hex.length < 2 ? '0' + hex : hex;
}

/** The canonical id for a (prefix, code) pair. */
export function opcodeId(prefix: string, code: number): string {
  return prefix ? `0x${prefix}.${code}` : `0x${toHex(code)}`;
}

/**
 * The id the pre-2026 page used: prefix and sub-opcode run together in hex,
 * `0xFD100`. Retained only to match against the legacy page during
 * verification; nothing on the site uses it.
 */
export function legacyHexId(prefix: string, code: number): string {
  return `0x${prefix}${toHex(code)}`;
}

/** Full byte encoding for a (prefix, code) pair. */
export function opcodeBytes(prefix: string, code: number): number[] {
  return prefix
    ? [parseInt(prefix, 16), ...leb128(code)]
    : [code];
}
