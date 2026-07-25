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
import { CATEGORY_LABELS, categorize } from './categories.ts';

export interface Tag {
  /** Stable token, used as the selector and in `data-tags`. */
  id: string;
  label: string;
  /** Groups the chips in the panel, and lets one kind be styled apart. */
  kind: 'category' | 'operation' | 'type' | 'trait' | 'status';
}

/** Value types that appear as a name prefix. */
const VALUE_TYPES = new Set(['i32', 'i64', 'f32', 'f64', 'v128']);

/** Vector lane shapes. */
const LANE_SHAPES = new Set(['i8x16', 'i16x8', 'i32x4', 'i64x2', 'f16x8', 'f32x4', 'f64x2']);

export function tagsFor(op: Opcode): Tag[] {
  if (!op.name) return [];

  const tags: Tag[] = [];
  const add = (id: string, label: string, kind: Tag['kind']) => tags.push({ id, label, kind });

  const category = categorize(op);
  add(`cat-${category}`, CATEGORY_LABELS[category], 'category');

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

  if (op.parts?.sign === 's') add('signed', 'signed', 'trait');
  if (op.parts?.sign === 'u') add('unsigned', 'unsigned', 'trait');

  if (op.section === 'simd' || op.section === 'simd-ext') add('vector', 'vector (SIMD)', 'trait');
  if (pre.includes('atomic') || op.name.startsWith('atomic.')) add('atomic', 'atomic', 'trait');
  if (op.prefix) add('prefixed', 'multi-byte opcode', 'trait');
  if (op.immediateArgs) add('immediates', 'takes immediates', 'trait');
  if (op.stack) add('documented-stack', 'stack signature known', 'trait');

  if (op.status !== 'standard') {
    add(op.status, op.status, 'status');
  }
  if (op.proposal) {
    add(`proposal-${op.proposal.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, op.proposal, 'status');
  }

  return tags;
}

/** The `data-tags` attribute value: a space-separated token list. */
export function tagTokens(op: Opcode): string {
  return tagsFor(op)
    .map((tag) => tag.id)
    .join(' ');
}
