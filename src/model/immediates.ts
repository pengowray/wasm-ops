/**
 * Immediate operands: the bytes an instruction carries after its opcode.
 *
 * Everything that repeats across instructions lives here — the encoding width
 * of each kind of operand, and what that kind means. An instruction records
 * only which kinds it takes and in what order, so the 113 instructions with a
 * memarg cannot disagree about what a memarg is, and there is one place to fix
 * it when the specification moves.
 *
 * That is the same argument the chart already makes for the encoding breakdown
 * and for what a prefix byte says about itself: derive it, do not copy it 113
 * times and wait for the copies to drift.
 */

import type { Immediate, ImmediateKind, Opcode } from './types.ts';

interface KindInfo {
  /**
   * How the bytes are encoded, set before the name. Omitted where the kind is
   * a structure of its own (`memarg`) or is spelled out in the gloss.
   */
  encoding?: string;
  /** What to call the kind, where the union member is not what a reader reads. */
  label?: string;
  /** What the kind means, where its name does not say it. */
  gloss?: string;
  /**
   * A fact about the kind rather than about any one instruction, set under the
   * list. Shown once however many operands of that kind an instruction takes.
   */
  note?: string;
}

/**
 * `u32` throughout for the index spaces: every one of them is a LEB128
 * unsigned integer, and a reader who has learnt that once has learnt it for
 * all eleven.
 */
const INDEX: KindInfo = { encoding: 'u32' };

const KINDS: Record<ImmediateKind, KindInfo> = {
  typeidx: INDEX,
  funcidx: INDEX,
  tableidx: INDEX,
  globalidx: INDEX,
  localidx: INDEX,
  labelidx: INDEX,
  memidx: INDEX,
  dataidx: INDEX,
  elemidx: INDEX,
  tagidx: INDEX,
  fieldidx: INDEX,
  stringidx: { encoding: 'u32', gloss: 'index into the module’s strings custom section' },

  laneidx: { encoding: 'u8' },

  valtype: {},
  heaptype: {
    encoding: 's33',
    gloss:
      'a negative one-byte value is an abstract type (0x70 func, 0x6F extern, 0x6E any, ' +
      '0x6D eq, 0x6C i31, 0x6B struct, 0x6A array, 0x69 exn, and the bottom types); a ' +
      'value of 0 or more is a typeidx',
  },
  blocktype: {
    encoding: 's33',
    gloss:
      '0x40 for no result; one valtype byte (0x7F i32, 0x7E i64, 0x7D f32, 0x7C f64, ' +
      '0x7B v128, or a reference type) for one result; or a typeidx of 0 or more, naming ' +
      'a function type, for a block that takes or returns more than one value',
  },

  // Align is encoded first. The page said otherwise on i32.load and i64.load
  // until 2026, which is the clearest argument there is for writing this once.
  memarg: {
    gloss: 'u32 align, then u64 offset',
    // What a memarg is was written out in full on i32.load and nowhere else,
    // under a heading reading "Stack", so the other 112 instructions that take
    // one could not reach it.
    note:
      '<i>align</i> is the base-2 logarithm of the assumed alignment in bytes — 0 for 1 ' +
      'byte, 1 for 2, 2 for 4, 3 for 8, 4 for 16 — and must not exceed the width of the ' +
      'access, or the module is rejected. A smaller value only tells the engine not to ' +
      'assume alignment. Bit 6 of <i>align</i> (0x40) marks a u32 memory index between the ' +
      'two fields; subtract 64 for the alignment. Without that bit the instruction uses ' +
      'memory 0.',
  },

  castflags: { encoding: 'u8', gloss: 'which of the two heap types is nullable' },

  ordering: { encoding: 'u8', gloss: '0x00 seqcst, 0x01 acqrel' },
  'rmw-ordering': {
    encoding: 'u8',
    label: 'ordering',
    gloss: '0x00 seqcst, 0x11 acqrel',
    note:
      'A read-modify-write packs the read ordering into the low four bits and the write ' +
      'ordering into the high four, and the two must match, so no other byte is valid.',
  },

  catch: {
    gloss:
      '0x00 <i>x</i> <i>l</i> (catch), 0x01 <i>x</i> <i>l</i> (catch_ref), 0x02 <i>l</i> ' +
      '(catch_all) or 0x03 <i>l</i> (catch_all_ref), where <i>x</i> is a tagidx and ' +
      '<i>l</i> a labelidx',
  },
  handler: {},

  i32: { gloss: 'signed LEB, 1–5 bytes' },
  i64: { gloss: 'signed LEB, 1–10 bytes' },
  f32: { gloss: '4 bytes, little-endian' },
  f64: { gloss: '8 bytes, little-endian' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The operand's name as it is written, subscript and all. */
function nameHtml(imm: Immediate): string {
  return (
    `<i>${escapeHtml(imm.name)}</i>` +
    (imm.index === undefined ? '' : `<sub>${imm.index}</sub>`)
  );
}

/**
 * The short form set beside the instruction name and in the encoding
 * breakdown: `m`, `y x`, `ord x y`. Plain letters, since it labels a slot in a
 * drawing of the bytes rather than describing one.
 */
export function immediateNames(op: Opcode): string {
  if (!op.immediates?.length) return '';
  return op.immediates
    .map((imm) => imm.name + (imm.index === undefined ? '' : String(imm.index)))
    .join(' ');
}

/** One operand as a list item: `u32 y : typeidx — the default target`. */
function renderImmediate(imm: Immediate): string {
  const info = imm.kind ? KINDS[imm.kind] : undefined;
  const encoding = imm.encoding ?? info?.encoding;
  const kind = imm.kind ? (info?.label ?? imm.kind) : undefined;
  const type = kind && imm.list ? `list(${kind})` : kind;

  // The gloss belonging to the kind, then anything this instruction adds. Both
  // sit after one em dash, which is the separator the chart already uses.
  const gloss = [info?.gloss, imm.note].filter(Boolean).join(' — ');

  return (
    '<li>' +
    (encoding ? `${escapeHtml(encoding)} ` : '') +
    nameHtml(imm) +
    (type ? ` : ${escapeHtml(type)}` : '') +
    (gloss ? ` — ${gloss}` : '') +
    '</li>'
  );
}

/**
 * The whole "Immediate operands" section: the operands, then whatever the
 * kinds have to say about themselves, then whatever this instruction has to
 * say about what follows them.
 *
 * Always an ordered list, even for a single operand — the numbering is turned
 * off in that case by CSS rather than by emitting two different shapes, so
 * every operand on the site is one kind of thing drawn one way.
 */
export function renderImmediates(op: Opcode): string {
  const immediates = op.immediates ?? [];
  if (!immediates.length && !op.followedByNote) return '';

  const list = immediates.length
    ? `<ol>${immediates.map(renderImmediate).join('')}</ol>`
    : '';

  // One note per kind however many operands of that kind there are: array.copy
  // takes two typeidx and should not be told twice what a typeidx is.
  const notes: string[] = [];
  for (const imm of immediates) {
    const note = imm.kind ? KINDS[imm.kind].note : undefined;
    if (note && !notes.includes(note)) notes.push(note);
  }

  return (
    list +
    notes.map((note) => `<p>${note}</p>`).join('') +
    (op.followedByNote ?? '')
  );
}
