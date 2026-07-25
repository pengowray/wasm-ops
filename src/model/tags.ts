/**
 * Property tags: the facts about an instruction that are worth asking "what
 * else is like this?" about.
 *
 * They are derived rather than stored — every one of them follows from the
 * name, the encoding or the status — and each is clickable, lighting up
 * everything that shares it. That is the point: the categories answer "what
 * kind of thing is this", tags answer "what else has this property", and those
 * are different questions. An instruction is in one category but carries
 * several tags.
 */

import type { Opcode } from './types.ts';
import { CATEGORY_LABELS, categorize, conceptFor, subcategorize } from './categories.ts';
import { proposal } from './proposals.ts';

export interface Tag {
  /** Stable token, used as the selector and in `data-tags`. */
  id: string;
  label: string;
  /** Groups the chips in the panel, and lets one kind be styled apart. */
  kind: 'category' | 'operation' | 'type' | 'trait' | 'status';
}

/** Value types that appear as a name prefix. */
const VALUE_TYPES = new Set(['i32', 'i64', 'f32', 'f64', 'v128']);

/**
 * Instructions that manipulate the operand stack and nothing else: that take
 * what is on it and rearrange it, computing nothing, touching no memory,
 * branching nowhere.
 *
 * There is exactly one. WebAssembly looks like a stack machine and is not
 * quite one — there is no `dup`, no `swap`, no `rot`, no way to reach past the
 * top of the stack at all. `select` chooses between two values but consumes
 * three and computes with them; `local.get` and `local.tee` do the work `dup`
 * would, but by going out to a local and back rather than by touching the
 * stack. Take away everything that only appears to rearrange the stack and
 * `drop` is what is left: the one instruction whose whole job is to make the
 * stack shorter.
 *
 * A reader who clicks the chip expecting a family and finds a single lit cell
 * has learned the thing the chart cannot say in a sentence. There is a link in
 * the reference for anyone who wants it spelled out.
 */
const STACK_OPS = new Set(['drop']);

/** Vector lane shapes. */
const LANE_SHAPES = new Set(['i8x16', 'i16x8', 'i32x4', 'i64x2', 'f16x8', 'f32x4', 'f64x2']);

export function tagsFor(op: Opcode): Tag[] {
  if (!op.name) return [];

  const tags: Tag[] = [];
  const add = (id: string, label: string, kind: Tag['kind']) => tags.push({ id, label, kind });

  const category = categorize(op);
  add(`cat-${category}`, CATEGORY_LABELS[category], 'category');
  // The card layout's headings are these two, so they answer the same question
  // a chip does — "what else is here?" — and are worth being clickable.
  const sub = subcategorize(op);
  if (sub) add(sub.tag, sub.label, 'category');

  /*
   * The property named by the operation itself, where the sub-group did not
   * already name it.
   *
   * A sub-group is a division of one category, so it can only ever gather what
   * is in that category: the numeric and vector arithmetic found each other
   * through "Arithmetic", but `i64.atomic.rmw.add` is filed under
   * "Read-modify-write" and carried no chip saying it adds. Adding is adding
   * wherever it happens, so it gets the same tag the others have — and clicking
   * "Arithmetic" now lights every instruction that computes a number, not the
   * ones that share a category with whichever you clicked.
   */
  const concept = conceptFor(op);
  if (concept && concept.tag !== sub?.tag) add(concept.tag, concept.label, 'category');

  const mainop = op.parts?.mainop;
  if (mainop) add(`op-${mainop}`, mainop, 'operation');

  const pre = op.parts?.pre ?? '';
  const head = pre.split('.')[0] ?? '';
  if (VALUE_TYPES.has(head)) add(`type-${head}`, head, 'type');
  if (LANE_SHAPES.has(head)) {
    add(`shape-${head}`, head, 'type');
    // The lane type is the interesting half of a shape: every f32x4 instruction
    // is doing something to 32-bit floats, whatever the vector width.
    const lane = /^([if])(\d+)x/.exec(head);
    if (lane) add(`lane-${lane[1]}${lane[2]}`, `${lane[1]}${lane[2]} lanes`, 'type');
  }

  // See STACK_OPS. The stack switching instructions are not here either: they
  // are about the execution stack, which is a different stack.
  if (STACK_OPS.has(op.name)) add('stack', 'stack manipulation', 'trait');

  if (op.parts?.sign === 's') add('signed', 'signed', 'trait');
  if (op.parts?.sign === 'u') add('unsigned', 'unsigned', 'trait');

  // Traits that merely restate the category are dropped: an instruction whose
  // category is already "Vector (SIMD)" gained nothing from a "vector (SIMD)"
  // trait beside it except the appearance of a duplicate.
  if ((op.section === 'simd' || op.section === 'simd-ext') && category !== 'vector') {
    add('vector', 'vector (SIMD)', 'trait');
  }
  if ((pre.includes('atomic') || op.name.startsWith('atomic.')) && category !== 'atomic') {
    add('atomic', 'atomic', 'trait');
  }
  if (op.prefix) add('prefixed', 'multi-byte opcode', 'trait');
  if (op.immediateArgs) add('immediates', 'takes immediates', 'trait');
  if (op.stack) add('documented-stack', 'stack signature known', 'trait');

  if (op.status !== 'standard') {
    add(op.status, op.status, 'status');
  }
  /*
   * The proposal an instruction arrived through.
   *
   * Named "<proposal> proposal" where the bare name is also a category, because
   * otherwise two chips on the same instruction both read "Garbage collection"
   * — one meaning "this is a GC instruction" and lighting 28, the other "this
   * came through the GC proposal" and lighting 32, including `ref.eq` over in
   * the core table. Two different questions cannot share a label.
   */
  const from = proposal(op.proposal);
  if (from) {
    const collides = Object.values(CATEGORY_LABELS).includes(from.name);
    add(`from-${from.id}`, collides ? `${from.name} proposal` : from.name, 'status');
  }

  return tags;
}

/** The `data-tags` attribute value: a space-separated token list. */
export function tagTokens(op: Opcode): string {
  return tagsFor(op)
    .map((tag) => tag.id)
    .join(' ');
}
