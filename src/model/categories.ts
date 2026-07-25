import type { Opcode } from './types.ts';

/**
 * Functional categories, used for grouping and colouring.
 *
 * The old page had a `shorthand` table doing roughly this, but it was switched
 * off — "disable until can be reworked with new op codes" — because it only
 * knew about the original MVP instructions and mislabelled everything added
 * since. This version keys off the structured name parts and the prefix, so
 * new instructions land somewhere sensible by default.
 */
export type CategoryId =
  | 'control'
  | 'parametric'
  | 'variable'
  | 'table'
  | 'memory'
  | 'numeric'
  | 'vector'
  | 'reference'
  | 'atomic'
  | 'string'
  | 'gc'
  | 'other';

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  control: 'Control flow',
  parametric: 'Parametric',
  variable: 'Variables',
  table: 'Table',
  memory: 'Memory',
  numeric: 'Numeric',
  vector: 'Vector (SIMD)',
  reference: 'Reference',
  atomic: 'Atomic',
  string: 'Strings',
  gc: 'Garbage collection',
  other: 'Other',
};

/** Order categories appear in when grouping by category. */
export const CATEGORY_ORDER: CategoryId[] = [
  'control',
  'parametric',
  'variable',
  'table',
  'memory',
  'numeric',
  'vector',
  'reference',
  'atomic',
  'gc',
  'string',
  'other',
];

/** Instructions whose category cannot be read off the name shape. */
const BY_NAME: Record<string, CategoryId> = {
  unreachable: 'control',
  nop: 'control',
  block: 'control',
  loop: 'control',
  if: 'control',
  else: 'control',
  end: 'control',
  br: 'control',
  br_if: 'control',
  br_table: 'control',
  return: 'control',
  call: 'control',
  call_indirect: 'control',
  call_ref: 'control',
  return_call: 'control',
  return_call_indirect: 'control',
  return_call_ref: 'control',
  try: 'control',
  try_table: 'control',
  catch: 'control',
  catch_all: 'control',
  delegate: 'control',
  throw: 'control',
  throw_ref: 'control',
  rethrow: 'control',
  drop: 'parametric',
  select: 'parametric',
  // The typed variant of select is written with its immediate: `select t`.
  'select t': 'parametric',
};

/** Namespace before the dot, e.g. `memory.grow` -> `memory`. */
const BY_PREFIX: Record<string, CategoryId> = {
  local: 'variable',
  global: 'variable',
  table: 'table',
  elem: 'table',
  memory: 'memory',
  data: 'memory',
  ref: 'reference',
  v128: 'vector',
  i8x16: 'vector',
  i16x8: 'vector',
  i32x4: 'vector',
  i64x2: 'vector',
  f32x4: 'vector',
  f64x2: 'vector',
  i32: 'numeric',
  i64: 'numeric',
  f32: 'numeric',
  f64: 'numeric',
  any: 'gc',
  eq: 'gc',
  struct: 'gc',
  array: 'gc',
  extern: 'gc',
  i31: 'gc',
  br_on_cast: 'gc',
  string: 'string',
  stringview_wtf8: 'string',
  stringview_wtf16: 'string',
  stringview_iter: 'string',
};

export function categorize(op: Opcode): CategoryId {
  if (!op.name) return 'other';

  const direct = BY_NAME[op.name];
  if (direct) return direct;

  // Atomics are named `i32.atomic.rmw.add`, so the prefix carries `atomic`.
  const pre = op.parts?.pre ?? '';
  if (pre.includes('atomic')) return 'atomic';

  // `memory.grow` etc. are load/store shaped but belong with memory.
  const head = pre.split('.')[0] ?? '';
  const byPrefix = BY_PREFIX[head];
  if (byPrefix) {
    // Loads and stores are memory operations regardless of their value type.
    const mainop = op.parts?.mainop ?? '';
    if (byPrefix === 'numeric' && (mainop === 'load' || mainop === 'store')) {
      return 'memory';
    }
    return byPrefix;
  }

  if (op.name.startsWith('br_on')) return 'control';
  if (op.section === 'simd' || op.section === 'simd-ext') return 'vector';
  if (op.section === 'gc') return 'gc';
  if (op.section === 'stringref') return 'string';
  if (op.section === 'threads') return 'atomic';
  return 'other';
}

/**
 * A finer split within a category, used to break the long groups in the card
 * layout into readable runs. "Numeric" alone is 140 instructions, which is a
 * wall; "comparison", "arithmetic", "bitwise" and "conversion" are four
 * shelves you can scan.
 *
 * Returns null where a category is small enough to need no dividing.
 */
export function subcategorize(op: Opcode): { id: string; label: string } | null {
  const mainop = op.parts?.mainop ?? '';
  const category = categorize(op);

  const of = (id: string, label: string) => ({ id, label });

  if (category === 'numeric' || category === 'vector') {
    if (['eq', 'ne', 'lt', 'gt', 'le', 'ge', 'eqz'].includes(mainop)) return of('compare', 'Comparison');
    if (['and', 'or', 'xor', 'shl', 'shr', 'rotl', 'rotr', 'clz', 'ctz', 'popcnt', 'bitselect', 'bitmask'].includes(mainop)) {
      return of('bitwise', 'Bitwise');
    }
    if (['wrap', 'extend', 'convert', 'demote', 'promote', 'reinterpret', 'trunc'].includes(mainop)) {
      return of('convert', 'Conversion');
    }
    if (['splat', 'shuffle', 'swizzle'].includes(mainop) || /_lane$/.test(op.name ?? '')) {
      return of('lanes', 'Lane access');
    }
    if (mainop === 'const') return of('const', 'Constants');
    if (['ceil', 'floor', 'nearest'].includes(mainop)) return of('round', 'Rounding');
    return of('arith', 'Arithmetic');
  }

  if (category === 'memory') {
    if (mainop === 'load') return of('load', 'Loads');
    if (mainop === 'store') return of('store', 'Stores');
    return of('manage', 'Managing memory');
  }

  if (category === 'control') {
    if (mainop.startsWith('br')) return of('branch', 'Branches');
    if (['call', 'return_call', 'return'].includes(mainop) || mainop.startsWith('call')) {
      return of('call', 'Calls');
    }
    if (['try', 'catch', 'throw', 'rethrow', 'delegate'].includes(mainop) || /throw|catch|try/.test(op.name ?? '')) {
      return of('exception', 'Exceptions');
    }
    return of('block', 'Blocks');
  }

  if (category === 'atomic') {
    if (/rmw/.test(op.parts?.pre ?? '')) return of('rmw', 'Read-modify-write');
    if (mainop === 'load' || mainop === 'store') return of('access', 'Atomic load and store');
    return of('sync', 'Synchronisation');
  }

  return null;
}
