/**
 * A one-line gloss for an instruction, shown under its name.
 *
 * Derived from the name rather than written out 692 times: the parts already
 * say what the operation is, what it acts on and whether it is signed, so the
 * sentence can be composed from them and stays consistent across every type.
 *
 * The aim is to add something. `f64.gt` → "greater than" is worth printing
 * because not everyone reads `gt` fluently, but `f64.floor` → "floor" is not —
 * it just says the name again, so that one is "round down to the nearest
 * integer" instead. Where nothing useful can be said, this returns null and no
 * line is shown.
 */

import type { Opcode } from './types.ts';

/** What the operation does, ignoring the type it does it to. */
const GLOSS: Record<string, string> = {
  // Comparison
  eq: 'equal',
  ne: 'not equal',
  lt: 'less than',
  gt: 'greater than',
  le: 'less than or equal',
  ge: 'greater than or equal',
  eqz: 'equal to zero',

  // Arithmetic
  add: 'add',
  sub: 'subtract',
  mul: 'multiply',
  div: 'divide',
  rem: 'remainder after division',
  neg: 'negate',
  abs: 'absolute value',
  min: 'smaller of the two',
  max: 'larger of the two',
  sqrt: 'square root',
  copysign: 'magnitude of the first, sign of the second',

  // Rounding
  ceil: 'round up to the nearest integer',
  floor: 'round down to the nearest integer',
  nearest: 'round to the nearest integer, ties to even',
  // As a rounding mode. With a source type after it (`i32.trunc_f32_s`) the
  // same word names a conversion, handled below.
  trunc: 'round toward zero',

  // Bitwise
  and: 'bitwise and',
  or: 'bitwise or',
  xor: 'bitwise exclusive or',
  shl: 'shift left',
  shr: 'shift right',
  rotl: 'rotate bits left',
  rotr: 'rotate bits right',
  clz: 'count leading zero bits',
  ctz: 'count trailing zero bits',
  popcnt: 'count one bits',

  // Conversion
  wrap: 'discard the high bits to fit a narrower type',
  extend: 'widen, keeping the value',
  convert: 'integer to floating point',
  demote: 'to the narrower float type',
  promote: 'to the wider float type',
  reinterpret: 'same bits, read as the other type',

  // Memory
  load: 'read from memory',
  store: 'write to memory',

  // Control
  br: 'branch to a label',
  return: 'return from the function',
  call: 'call a function',
  drop: 'discard the top of the stack',
  select: 'choose one of two values',
  nop: 'do nothing',
  unreachable: 'trap immediately',

  // Vector
  splat: 'copy one value into every lane',
  swizzle: 'rearrange lanes by an index vector',
  shuffle: 'build a vector from lanes of two others',
  bitselect: 'pick bits from two vectors by a mask',
};

/** Operations whose gloss would only repeat the name. */
const SAY_NOTHING = new Set(['block', 'loop', 'if', 'else', 'end', 'const']);

function bytes(opbits: string | undefined): string | null {
  if (!opbits || /x/.test(opbits)) return null;
  const bits = Number(opbits);
  if (!Number.isFinite(bits)) return null;
  return `${bits / 8} byte${bits === 8 ? '' : 's'}`;
}

export function summarize(op: Opcode): string | null {
  const parts = op.parts;
  const mainop = parts?.mainop;
  if (!op.name || !mainop || SAY_NOTHING.has(mainop)) return null;

  const gloss = GLOSS[mainop];
  if (!gloss) return null;

  const sign = parts?.sign;
  const width = bytes(parts?.opbits);

  // A narrow load or store says how much it moves, and what happens to the
  // spare bits on the way in.
  if (mainop === 'load' && width) {
    const fill = sign === 's' ? 'sign-extended' : sign === 'u' ? 'zero-extended' : null;
    return fill ? `read ${width} from memory, ${fill}` : `read ${width} from memory`;
  }
  if (mainop === 'store' && width) return `write the low ${width} to memory`;

  // `trunc` with a source type is a float-to-integer conversion, not a rounding
  // mode — and the saturating variants differ in what they do out of range,
  // which is the only thing worth saying about them.
  const post = parts?.post ?? '';
  if (mainop === 'trunc' && post) {
    const how = post.startsWith('sat')
      ? 'float to integer, clamped to the range'
      : 'float to integer, trapping out of range';
    return sign ? `${how}, ${sign === 's' ? 'signed' : 'unsigned'}` : how;
  }

  if (sign) return `${gloss}, ${sign === 's' ? 'signed' : 'unsigned'}`;
  return gloss;
}
