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
 * layout into readable runs. "Numeric" alone is 144 instructions, which is a
 * wall; "arithmetic", "rounding", "comparison" and "conversion" are shelves you
 * can scan.
 *
 * Returns null where a category is small enough to need no dividing.
 */
export interface Subcategory {
  /** Short id, unique within its category. */
  id: string;
  label: string;
  /**
   * Selector token, derived from the label rather than from the category.
   *
   * It used to be `sub-<category>-<id>`, which made a separate tag for every
   * category a sub-group appeared in — so there were two chips both reading
   * "Rounding", one lighting the eight numeric roundings and one the twelve
   * vector ones, and two reading "Arithmetic" over 38 and 131 instructions.
   * Whichever you clicked, the chip named a property and then lit a fraction of
   * the instructions having it.
   *
   * Rounding a float and rounding four floats at once are the same property,
   * so they are one tag. Where two sub-groups genuinely differ they already say
   * so in their labels — "Loads and stores" and "Atomic load and store" are
   * different words and stay different tags — which makes the label the honest
   * key, and makes a chip's text exactly describe the set it lights.
   */
  tag: string;
  /** Position within the category, so a sub-group appears once and whole. */
  rank: number;
}

/**
 * The order sub-groups appear in, per category, and — since each is listed
 * once — the guarantee that a sub-group is a single run rather than a label
 * that reappears every time the byte order happens to come back to it.
 */
const SUB_ORDER: Partial<Record<CategoryId, readonly string[]>> = {
  control: ['block', 'branch', 'call', 'exception'],
  variable: ['local', 'global'],
  memory: ['load', 'store', 'manage'],
  numeric: ['const', 'arith', 'round', 'compare', 'bitwise', 'convert'],
  vector: ['const', 'access', 'lanes', 'arith', 'round', 'compare', 'bitwise', 'convert'],
  atomic: ['access', 'rmw', 'sync'],
  gc: ['struct', 'array', 'i31', 'cast', 'extern'],
};

/**
 * The operation an instruction performs, and whatever qualifies it.
 *
 * `f32.trunc` is the operation `trunc` with nothing after it; `i32.trunc_f32_s`
 * is `trunc` qualified by `f32_s`. The distinction is what separates rounding a
 * float from converting one, and several sub-groups turn on it.
 *
 * Relaxed SIMD is the case the data does not state directly: those names are
 * decomposed with `relaxed` as the operation and the real one in the remainder.
 * Read literally, all 37 of them were operations called `relaxed` that matched
 * no rule and fell into the catch-all — so `relaxed_trunc_f32x4_s` was filed as
 * arithmetic and `relaxed_swizzle` with it, instead of conversion and lane
 * access. Unwrapping that here fixes every rule at once.
 */
export function operationParts(op: Opcode): { op: string; rest: string } {
  const parts = op.parts;
  if (!parts?.mainop) return { op: op.name ?? '', rest: '' };

  const tail = [parts.post, parts.rest, parts.sign].filter(Boolean).join('_');
  if (parts.mainop !== 'relaxed') return { op: parts.mainop, rest: tail };

  const [first, ...others] = tail.split('_');
  return first ? { op: first, rest: others.join('_') } : { op: parts.mainop, rest: '' };
}

/** Just the operation word — the heading an instruction files under by name. */
export function operationKey(op: Opcode): string {
  return operationParts(op).op;
}

const COMPARE = new Set(['eq', 'ne', 'lt', 'gt', 'le', 'ge', 'eqz', 'any_true', 'all_true']);
const BITWISE = new Set([
  'and', 'or', 'xor', 'not', 'andnot', 'shl', 'shr', 'rotl', 'rotr',
  'clz', 'ctz', 'popcnt', 'bitselect', 'bitmask',
  // Chooses lanes from two vectors by a mask, which is `bitselect` a lane at a
  // time rather than anything arithmetic.
  'laneselect',
]);
/** Rounding only when nothing follows: `f32.trunc` rounds, `i32.trunc_f32_s` converts. */
const ROUND = new Set(['ceil', 'floor', 'nearest', 'trunc']);
const CONVERT = new Set([
  'wrap', 'extend', 'convert', 'demote', 'promote', 'reinterpret', 'trunc', 'narrow',
]);
/** Getting values into and out of vector lanes, rather than operating on them. */
const LANES = new Set(['splat', 'shuffle', 'swizzle', 'extract', 'replace']);
/**
 * Computing a number from numbers. Listed rather than left as the catch-all the
 * numeric and vector sub-grouping uses, because outside those two categories
 * there is no catch-all to fall into — an atomic `add` has to be recognised to
 * be called arithmetic.
 */
const ARITHMETIC = new Set([
  'add', 'sub', 'mul', 'div', 'rem', 'neg', 'abs', 'min', 'max', 'sqrt',
  'avgr', 'dot', 'madd', 'nmadd', 'q15mulr', 'extadd', 'extmul', 'pmin', 'pmax',
  'copysign',
]);

/**
 * The properties that are the same wherever they turn up, keyed by operation
 * word. Adding is adding whether it is one integer, four floats at once, or one
 * integer read-modify-written under a lock.
 *
 * These are the labels the numeric and vector sub-groups already use, so an
 * instruction reached by either route lands on the same tag; that is what lets
 * a chip reading "Arithmetic" light every arithmetic instruction rather than
 * the ones that happen to share a category with it.
 */
export function conceptFor(op: Opcode): { tag: string; label: string } | null {
  const { op: word, rest } = operationParts(op);
  const label = ROUND.has(word) && !rest
    ? 'Rounding'
    : CONVERT.has(word)
      ? 'Conversion'
      : COMPARE.has(word)
        ? 'Comparison'
        : BITWISE.has(word)
          ? 'Bitwise'
          : ARITHMETIC.has(word)
            ? 'Arithmetic'
            : null;
  return label ? { tag: tagFor(label), label } : null;
}

/** One tag per distinct label, so the two can never describe different sets. */
function tagFor(label: string): string {
  return 'sub-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function pick(category: CategoryId, id: string, label: string): Subcategory {
  const order = SUB_ORDER[category] ?? [];
  const rank = order.indexOf(id);
  return { id, label, tag: tagFor(label), rank: rank < 0 ? order.length : rank };
}

export function subcategorize(op: Opcode): Subcategory | null {
  const { op: mainop, rest } = operationParts(op);
  const post = op.parts?.post ?? '';
  const pre = op.parts?.pre ?? '';
  const name = op.name ?? '';
  const category = categorize(op);
  const of = (id: string, label: string) => pick(category, id, label);

  if (category === 'numeric' || category === 'vector') {
    if (mainop === 'const') return of('const', 'Constants');
    // v128 loads and stores are the vector half of memory access; the numeric
    // types' loads and stores are categorised as memory and never reach here.
    if (mainop === 'load' || mainop === 'store') return of('access', 'Loads and stores');
    if (LANES.has(mainop) || post === 'lane') return of('lanes', 'Lane access');
    // Rounding only when nothing qualifies it: `f32.trunc` rounds a float,
    // `i32.trunc_f32_s` turns one into an integer.
    if (ROUND.has(mainop) && !rest) return of('round', 'Rounding');
    if (CONVERT.has(mainop)) return of('convert', 'Conversion');
    if (COMPARE.has(mainop)) return of('compare', 'Comparison');
    if (BITWISE.has(mainop)) return of('bitwise', 'Bitwise');
    return of('arith', 'Arithmetic');
  }

  if (category === 'memory') {
    if (mainop === 'load') return of('load', 'Loads');
    if (mainop === 'store') return of('store', 'Stores');
    return of('manage', 'Managing memory');
  }

  if (category === 'variable') {
    return name.startsWith('global.') ? of('global', 'Globals') : of('local', 'Locals');
  }

  if (category === 'control') {
    if (/throw|catch|try|delegate/.test(name)) return of('exception', 'Exceptions');
    if (mainop.startsWith('br')) return of('branch', 'Branches');
    if (mainop.startsWith('call') || mainop.startsWith('return')) return of('call', 'Calls');
    return of('block', 'Blocks');
  }

  if (category === 'atomic') {
    if (/rmw/.test(pre)) return of('rmw', 'Read-modify-write');
    if (mainop === 'load' || mainop === 'store') return of('access', 'Atomic load and store');
    return of('sync', 'Synchronisation');
  }

  if (category === 'gc') {
    const head = pre.split('.')[0] ?? '';
    if (name.startsWith('br_on_cast') || mainop === 'test' || mainop === 'cast') {
      return of('cast', 'Casts and tests');
    }
    if (head === 'struct') return of('struct', 'Structs');
    if (head === 'array') return of('array', 'Arrays');
    if (head === 'i31') return of('i31', 'i31 references');
    if (head === 'any' || head === 'extern') return of('extern', 'Host conversions');
    return null;
  }

  return null;
}

/** Sort key that keeps each sub-group together, in `SUB_ORDER` order. */
export function subcategoryRank(op: Opcode): number {
  return subcategorize(op)?.rank ?? -1;
}
