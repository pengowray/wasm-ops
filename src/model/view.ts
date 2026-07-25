/**
 * Turns the opcode data plus a set of view options into a flat, ordered list of
 * items to lay out.
 *
 * The same function runs at build time to emit the static page and in the
 * browser to re-lay-it-out, so the two can never drift. Everything downstream
 * of here — the renderer and the FLIP animation — only sees `ViewItem[]`.
 */

import type { Opcode, OpcodeData, Section, SectionId } from './types.ts';
import { HISTORICAL, toHex } from './types.ts';
import { CATEGORY_LABELS, CATEGORY_ORDER, categorize, type CategoryId } from './categories.ts';

/**
 * `matrix` lays each section out as the familiar 16-wide byte grid, where a
 * cell's position *is* its opcode. That only means anything when ordering by
 * opcode within a section, so choosing it fixes the grouping and sort.
 * `list` flows cells in whatever order and grouping is asked for.
 */
export type Layout = 'matrix' | 'list';
export type GroupBy = 'section' | 'category' | 'none';
/**
 * `name` sorts on the operation, ignoring the type it acts on, so every
 * `store` sits together regardless of whether it is `f32.store` or `i64.store`.
 * `type-name` sorts on the full name, which keeps each type's instructions
 * together instead.
 */
export type OrderBy = 'opcode' | 'name' | 'type-name';

export interface ViewOptions {
  layout: Layout;
  group: GroupBy;
  order: OrderBy;
  /** Sections to include. */
  sections: SectionId[];
  /**
   * Include unassigned slots. Only applies to the byte grid, where a gap tells
   * you that a byte value is unused. A list of blanks tells you nothing, so
   * list layouts drop them regardless.
   */
  showReserved: boolean;
  /** Include instructions that are still proposals. */
  showProposals: boolean;
  /**
   * Include superseded and abandoned encodings. Off by default: they describe
   * what a byte used to mean, which is worth recording but is not what someone
   * reading the chart to understand a module today is looking for.
   */
  showHistorical: boolean;
}

export const DEFAULT_VIEW: ViewOptions = {
  layout: 'matrix',
  // Grouping is ignored by the byte grid, which is always by section. This is
  // the default the list layout picks up, and matches the toolbar.
  group: 'category',
  order: 'opcode',
  sections: ['core', 'gc', 'stringref', 'fc', 'simd', 'relaxed-simd', 'threads'],
  showReserved: true,
  showProposals: true,
  showHistorical: false,
};

export type ViewItem =
  | {
      kind: 'group';
      key: string;
      /** HTML id for the heading — the link target for jumps and deep links. */
      anchor: string;
      label: string;
      emoji?: string;
      intro?: string;
      count: number;
    }
  /**
   * The top-left cell of a byte grid. It carries the section's prefix, so the
   * grid reads as an equation: corner `0xFD` + row `E_` + column `_8` is the
   * sub-opcode 0xE8. Without it the axes are unlabelled hex nibbles.
   */
  | { kind: 'corner'; key: string; label: string }
  | { kind: 'colhead'; key: string; label: string }
  | { kind: 'rowhead'; key: string; label: string }
  /**
   * `filtered` cells are shown as empty slots rather than dropped. In the byte
   * grid a cell's position *is* its opcode, so removing one would shift every
   * cell after it and the grid would stop meaning anything.
   */
  | { kind: 'cell'; key: string; op: Opcode; filtered?: boolean };

/** The grid is a row-label column plus 16 value columns. */
export const MATRIX_COLUMNS = 17;

/** Whether an opcode passes the status filters (section filtering is separate). */
function passesStatus(op: Opcode, options: ViewOptions): boolean {
  if (op.status === 'reserved' && !options.showReserved) return false;
  if (op.status === 'proposal' && !options.showProposals) return false;
  if (HISTORICAL.includes(op.status) && !options.showHistorical) return false;
  return true;
}

function visible(op: Opcode, options: ViewOptions): boolean {
  return options.sections.includes(op.section) && passesStatus(op, options);
}

/**
 * Row label for a run of 16 opcodes, e.g. `3_` for 0x30–0x3F, `10_` for
 * 0x100–0x10F. Derived from the code so sections that do not start at zero
 * (stringref at 0x80, relaxed SIMD at 0x100) label correctly.
 */
function rowLabel(code: number): string {
  return toHex(code >> 4).replace(/^0(?=.)/, '') + '_';
}

/**
 * The part of a name that is the operation rather than the type it acts on:
 * `f32.store` and `i64.store` both reduce to `store`, and
 * `i32.atomic.rmw16.xchg_u` to `xchg_u`.
 */
function operationOf(op: Opcode): string {
  const pre = op.parts?.pre;
  if (!op.name) return '';
  return pre && op.name.startsWith(pre + '.') ? op.name.slice(pre.length + 1) : op.name;
}

function sortOpcodes(ops: Opcode[], order: OrderBy): Opcode[] {
  if (order === 'name' || order === 'type-name') {
    const byOperation = order === 'name';
    return [...ops].sort((a, b) => {
      // Unassigned slots have no name to sort by; they sink to the end.
      if (!a.name || !b.name) return (a.name ? 0 : 1) - (b.name ? 0 : 1);
      if (byOperation) {
        // Ties fall back to the type, so the variants of one operation stay in
        // a predictable order rather than whatever the byte order happens to be.
        return (
          operationOf(a).localeCompare(operationOf(b)) ||
          (a.parts?.pre ?? '').localeCompare(b.parts?.pre ?? '') ||
          a.code - b.code
        );
      }
      return a.name.localeCompare(b.name) || a.code - b.code;
    });
  }
  // Single-byte opcodes first, then each prefix in byte order, then by
  // sub-opcode. Derived from prefix and code rather than the encoded bytes, so
  // the client payload does not have to carry the encoding.
  return [...ops].sort(
    (a, b) =>
      (a.prefix ? 1 : 0) - (b.prefix ? 1 : 0) ||
      a.prefix.localeCompare(b.prefix) ||
      a.code - b.code,
  );
}

/** Lays one section out as a 16-wide byte grid, with row and column headers. */
function matrixItems(section: Section, ops: Opcode[], options: ViewOptions): ViewItem[] {
  const items: ViewItem[] = [];
  items.push({
    kind: 'corner',
    key: `corner:${section.id}`,
    label: section.prefix ? `0x${section.prefix}` : '0x',
  });
  for (let i = 0; i < 16; i++) {
    items.push({
      kind: 'colhead',
      key: `colhead:${section.id}:${i}`,
      label: `_${i.toString(16).toUpperCase()}`,
    });
  }

  // Walk the section's full code range so gaps keep their position, and drop
  // any row that filtering has emptied entirely.
  for (let base = section.start; base < section.start + section.count; base += 16) {
    const row = ops.filter((op) => op.code >= base && op.code < base + 16);
    // Row labels are explicit rather than positional, so a row in which
    // everything has been filtered away can be dropped without misaligning
    // the rows that remain.
    if (!row.length || row.every((op) => !passesStatus(op, options))) continue;
    items.push({ kind: 'rowhead', key: `rowhead:${section.id}:${base}`, label: rowLabel(base) });
    for (const op of row) {
      const filtered = !passesStatus(op, options);
      items.push({ kind: 'cell', key: op.id, op, ...(filtered ? { filtered } : {}) });
    }
  }
  return items;
}

export function buildView(data: OpcodeData, options: ViewOptions): ViewItem[] {
  // The byte grid is only meaningful grouped by section and ordered by byte,
  // and it keeps every cell of a shown section so positions stay honest.
  if (options.layout === 'matrix') {
    const items: ViewItem[] = [];
    for (const section of data.sections) {
      if (!options.sections.includes(section.id)) continue;
      const sectionOps = data.opcodes.filter((op) => op.section === section.id);
      if (!sectionOps.length) continue;
      items.push({
        kind: 'group',
        key: `group:section:${section.id}`,
        anchor: section.anchor,
        label: section.title,
        ...(section.emoji ? { emoji: section.emoji } : {}),
        ...(section.intro ? { intro: section.intro } : {}),
        count: sectionOps.filter((op) => passesStatus(op, options) && op.name).length,
      });
      items.push(...matrixItems(section, sectionOps, options));
    }
    return items;
  }

  // --- list layouts -------------------------------------------------------
  // `linkTo` cells are the prefix bytes, which exist to point at the sub-table
  // that decodes them. In the byte grid they occupy a real byte value and have
  // to be there; in a list of instructions they are not instructions.
  const listable = data.opcodes.filter((op) => op.name && !op.linkTo && visible(op, options));

  if (options.group === 'none') {
    return sortOpcodes(listable, options.order).map((op) => ({
      kind: 'cell' as const,
      key: op.id,
      op,
    }));
  }

  const items: ViewItem[] = [];

  if (options.group === 'section') {
    for (const section of data.sections) {
      if (!options.sections.includes(section.id)) continue;
      const group = sortOpcodes(
        listable.filter((op) => op.section === section.id),
        options.order,
      );
      if (!group.length) continue;
      items.push({
        kind: 'group',
        key: `group:section:${section.id}`,
        anchor: section.anchor,
        label: section.title,
        ...(section.emoji ? { emoji: section.emoji } : {}),
        ...(section.intro ? { intro: section.intro } : {}),
        count: group.length,
      });
      for (const op of group) items.push({ kind: 'cell', key: op.id, op });
    }
    return items;
  }

  // group === 'category'
  const buckets = new Map<CategoryId, Opcode[]>();
  for (const op of listable) {
    const category = categorize(op);
    let bucket = buckets.get(category);
    if (!bucket) buckets.set(category, (bucket = []));
    bucket.push(op);
  }
  for (const category of CATEGORY_ORDER) {
    const group = buckets.get(category);
    if (!group?.length) continue;
    const sorted = sortOpcodes(group, options.order);
    items.push({
      kind: 'group',
      key: `group:category:${category}`,
      anchor: `cat-${category}`,
      label: CATEGORY_LABELS[category],
      count: sorted.length,
    });
    for (const op of sorted) items.push({ kind: 'cell', key: op.id, op });
  }
  return items;
}
