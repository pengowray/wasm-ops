/**
 * The opcode model, shared by the static-site generator and the browser client.
 *
 * The old page encoded all of this implicitly: an opcode's byte value came from
 * its cell's position in a hand-written table, and its groupings came from a
 * regex run over the cell text at page load. Both are now explicit and typed.
 */

export type SectionId =
  | 'core'
  | 'gc'
  | 'stringref'
  | 'fc'
  | 'simd'
  | 'relaxed-simd'
  | 'threads';

export interface Section {
  id: SectionId;
  /** Heading text, without the emoji. */
  title: string;
  emoji?: string;
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
 * How settled an opcode is. `reserved` covers both genuinely-empty slots and
 * slots whose only content is a name (the old page's `*name` convention marked
 * a proposal; a bare `&nbsp;` marked an unused slot).
 */
export type OpcodeStatus = 'standard' | 'proposal' | 'reserved';

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
   * Canonical id, and the anchor used in URLs: `0x00`, `0xFB80`, `0xFD100`.
   * Matches the ids the old help divs used, so existing deep links survive.
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
  parts?: NameParts;
  /** Immediate operands, shown beside the name: `[t?]`, `x`. HTML. */
  immediateArgs?: string;
  /** What follows the opcode in the byte stream. HTML. */
  followedBy?: string;
  stack?: StackSignature;
  /** Descriptive prose. HTML. */
  description?: string;
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
  return `0x${prefix}${toHex(code)}`;
}

/** Full byte encoding for a (prefix, code) pair. */
export function opcodeBytes(prefix: string, code: number): number[] {
  return prefix
    ? [parseInt(prefix, 16), ...leb128(code)]
    : [code];
}
